'use strict';

var async = require('async');
var bitcore = require('qtumcore-lib');
var BigNumber = require('bignumber.js');
var LRU = require('lru-cache');
var Common = require('../lib/common');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var STATISTIC_TYPE = 'STATISTIC';
var SupplyHelper = require('../helpers/SupplyHelper');

/**
 *
 * @param {Object} options
 * @constructor
 */
function StatisticService(options) {

    this.node = options.node;
    this.statisticDayRepository = options.statisticDayRepository;
    this.totalStatisticRepository = options.totalStatisticRepository;

    this.addressBalanceService = options.addressBalanceService;
    this.lastBlockRepository = options.lastBlockRepository;

    /**
     * 24h Cache
     */
    this.subsidyByBlockHeight = LRU(999999);
    this.blocksByHeight = LRU(999999);
    this.feeByHeight = LRU(999999);
    this.outputsByHeight = LRU(999999);


    /**
     * Statistic Cache By Days
     */
    this.statisticByDays = LRU(999999999);
    this.knownBlocks = LRU(999999999);

    this.lastCheckedBlock = 0;

    /**
     *
     * @type {Common}
     */
    this.common = new Common({log: this.node.log});

    this.lastTipHeight = 0;
    this.lastTipInProcess = false;
    this.lastTipTimeout = false;

}

util.inherits(StatisticService, EventEmitter);

/**
 *
 * @param {Function} callback
 * @return {*}
 */
StatisticService.prototype.start = function (callback) {

    var self = this,
        height = self.node.services.qtumd.height;

    return async.waterfall([function (callback) {
        return self.lastBlockRepository.setLastBlockType(STATISTIC_TYPE, 0, function(err) {

            if (err) {

                self.common.log.error('[STATISTICS Service] setLastBlockType Error', err);

                return callback(err)
            }

            self.common.log.info('[STATISTICS Service] LastBlockType set');

            return callback();

        });
    }, function (callback) {
        return self.lastBlockRepository.getLastBlockByType(STATISTIC_TYPE, function(err, existingType) {

            if (err) {

                self.common.log.error('[STATISTICS Service] getLastBlockByType Error', err);

                return callback(err)
            }

            self.lastCheckedBlock = existingType.last_block_number;

            self.common.log.info('[STATISTICS Service] getLastBlockByType set', self.lastCheckedBlock);

            return callback();

        });
    }, function (callback) {

        self.common.log.info('[STATISTICS Service] start upd prev blocks');

        return self.processPrevBlocks(height, function (err) {

            if (err) {
                return callback(err);
            }

            self.common.log.info('[STATISTICS Service] updated prev blocks');

            return callback(err);

        });

    }], function (err) {

        if (err) {
            return callback(err);
        }

        self.node.services.qtumd.on('tip', self._rapidProtectedUpdateTip.bind(self));
        self._rapidProtectedUpdateTip(height);

        return callback(err);
    });

};

/**
 *
 * @param {Object} data
 * @param {Function} next
 * @return {*}
 */
StatisticService.prototype.process24hBlock = function (data, next) {

    var self = this,
        block = data.blockJson,
        subsidy = data.subsidy,
        fee = data.fee,
        totalOutputs = data.totalOutputs,
        currentDate = new Date();

    currentDate.setDate(currentDate.getDate() - 1);

    var minTimestamp = currentDate.getTime() / 1000,
        maxAge = (block.time - minTimestamp) * 1000;

    if (maxAge > 0) {
        self.blocksByHeight.set(block.height, block, maxAge);
        self.subsidyByBlockHeight.set(block.height, subsidy, maxAge);
        self.feeByHeight.set(block.height, fee, maxAge);
        self.outputsByHeight.set(block.height, totalOutputs, maxAge);
    }

    return next();

};

/**
 *
 * @param {Number} height
 * @param {Function} next
 * @return {*}
 */
StatisticService.prototype.processPrevBlocks = function (height, next) {

    var self = this,
        dataFlow = {
            blockJson: null
        };

    return async.doDuring(
        function(callback) {

            return self.node.getJsonBlock(height, function (err, blockJson) {

                if (err) {
                    return callback(err);
                }

                dataFlow.blockJson = blockJson;

                return callback();
            });

        },
        function(callback) {

            var block = dataFlow.blockJson,
                currentDate = new Date();

            currentDate.setDate(currentDate.getDate() - 1);

            var minTimestamp = currentDate.getTime() / 1000,
                maxAge = (block.time - minTimestamp) * 1000;

            height--;

            if (maxAge > 0) {
                return async.waterfall([function (callback) {
                    return self._getBlockInfo(block.height, function (err, data) {
                        return callback(err, data);
                    });
                }, function (data, callback) {
                    return self.process24hBlock(data, function (err) {
                        return callback(err);
                    });
                }], function (err) {
                    return callback(err, true);
                });

            } else {
                return callback(null, false);
            }

        },
        function (err) {
            
            return next(err);
        }
    );

};

/**
 *
 * @param {Number} height
 * @param {Function} next
 * @return {*}
 * @private
 */
StatisticService.prototype._getLastBlocks = function(height, next) {

    var self = this,
        blocks = [];

    for (var i = self.lastCheckedBlock + 1; i <= height; i++) {
        blocks.push(i);
    }

    return async.eachSeries(blocks, function (blockHeight, callback) {

        return self.processBlock(blockHeight, function (err) {
            return callback(err);
        });

    }, function (err) {
        return next(err);
    });

};

/**
 *
 * @param {Number} blockHeight
 * @param {Function} next
 * @return {*}
 * @private
 */
StatisticService.prototype._getBlockInfo = function (blockHeight, next) {

    var self = this,
        dataFlow = {
            subsidy: null,
            block: null,
            blockJson: null,
            fee: 0,
            totalOutputs: 0
        };

    return async.waterfall([function (callback) {
        return self.node.getJsonBlock(blockHeight, function (err, blockJson) {
            if((err && err.code === -5) || (err && err.code === -8)) {
                return callback(err);
            } else if(err) {
                return callback(err);
            }

            dataFlow.blockJson = blockJson;

            return callback();
        });
    }, function (callback) {

        /**
         * Block
         */
        return self.node.getBlock(blockHeight, function(err, block) {

            if((err && err.code === -5) || (err && err.code === -8)) {
                return callback(err);
            } else if(err) {
                return callback(err);
            }

            dataFlow.block = block;

            return callback();

        });
    }, function (callback) {

        /**
         * Subsidy
         */
        return self.node.getSubsidy(blockHeight, function(err, result) {
            dataFlow.subsidy = result;
            return callback();
        });

    }, function (callback) {

        /**
         * Fee
         */

        if (dataFlow.blockJson.flags === bitcore.Block.PROOF_OF_STAKE) { // IsProofOfStake

            var transaction1 = dataFlow.block.transactions[1],
                output1 = transaction1.outputs[1],
                output2 = transaction1.outputs[2],
                input0 = transaction1.inputs[0],
                prevTxId = input0.prevTxId,
                outputIndex = input0.outputIndex,
                currentVoutsAmount = output1.satoshis;

            if (output2 && !output2.script.isPublicKeyHashOut()) {
                currentVoutsAmount += output2.satoshis;
            }

            if (prevTxId) {
                return self.node.getTransaction(prevTxId.toString('hex'), function (err, transaction) {
                    if (err) {
                        return callback(err);
                    }

                    dataFlow.fee = currentVoutsAmount - transaction.outputs[outputIndex].satoshis;

                    return callback();

                });
            } else {
                return callback();
            }

        } else {//IsProofOfWork
            var transaction0 = dataFlow.block.transactions[0],
                output0 = transaction0.outputs[0];

            if (output0 && (output0.satoshis - dataFlow.subsidy) > 0) {
                dataFlow.fee = output0.satoshis - dataFlow.subsidy;
            }

        }

        return callback();

    }, function (callback) {

        /**
         * Total outputs
         */

        var trxsExcept = [];

        if (dataFlow.blockJson.flags === bitcore.Block.PROOF_OF_STAKE) { // IsProofOfStake
            trxsExcept.push(0, 1);
        } else { //IsProofOfWork
            trxsExcept.push(0);
        }

        dataFlow.block.transactions.forEach(function (transaction, idx) {
            if (trxsExcept.indexOf(idx) === -1) {
                transaction.outputs.forEach(function (output) {
                    dataFlow.totalOutputs += output.satoshis;
                });
            }
        });

        return callback();

    }], function (err) {

        if (err) {
            return next(err);
        }

        return next(err, dataFlow);

    });

};

/**
 *
 * @param {Number} blockHeight
 * @param {Function} next
 * @return {*}
 */
StatisticService.prototype.processBlock = function (blockHeight, next) {

    var self = this;

    return self._getBlockInfo(blockHeight, function (err, data) {

        if (err) {
            return next(err);
        }

        if (self.knownBlocks.get(blockHeight)) {
            return callback();
        }

        self.knownBlocks.set(blockHeight, true);

        self.lastCheckedBlock = blockHeight;

        var block = data.blockJson,
            date = new Date(block.time * 1000),
            formattedDate = self.formatTimestamp(date);

        return async.waterfall([function (callback) {
            return self.lastBlockRepository.updateOrAddLastBlock(block.height, STATISTIC_TYPE, function (err) {
                return callback(err);
            });
        }, function (callback) {
            return self.updateOrCreateDay(formattedDate, data, function (err) {
                return callback(err);
            });
        }, function (callback) {

            if (data.subsidy && block.flags === bitcore.Block.PROOF_OF_STAKE) {

                var dataFlow = {
                    posTotalAmount: 0
                };

                return async.waterfall([function (callback) {

                    return self.totalStatisticRepository.getPOSTotalAmount(function (err, value) {
                        if (err) {
                            return callback(err);
                        }

                        dataFlow.posTotalAmount = value;

                        return callback();
                    });

                }, function (callback) {

                    return self.totalStatisticRepository.createOrUpdatePosTotalAmount(new BigNumber(dataFlow.posTotalAmount).plus(data.subsidy).toString(10), function (err) {
                        return callback(err);
                    });

                }], function (err) {
                    return callback(err);
                });

            }

            return callback();

        }, function (callback) {
            return self.process24hBlock(data, function (err) {
                return callback(err);
            });
        }], function (err) {
            return next(err);
        });

    });

};

/**
 *
 * @param {String} date e.g. 01-01-2018
 * @param {Object} data
 * @param next
 * @return {*}
 */
StatisticService.prototype.updateOrCreateDay = function (date, data, next) {

    var self = this,
        block = data.blockJson,
        subsidy = data.subsidy,
        fee = data.fee,
        totalOutputs = data.totalOutputs,
        dataFlow = {
            day: null,
            formattedDay: null
        };

    return async.waterfall([function (callback) {
        return self.statisticDayRepository.getDay(new Date(date), function (err, day) {

            if (err) {
                return callback(err);
            }

            if (!day) {

                dataFlow.day = {
                    totalTransactionFees: {
                        sum: '0',
                        count: '0'
                    },
                    numberOfTransactions: {
                        count: '0'
                    },
                    totalOutputVolume: {
                        sum: '0'
                    },
                    totalBlocks: {
                        count: '0'
                    },
                    difficulty: {
                        sum: '0',
                        count: '0'
                    },
                    stake: {
                        sum: '0'
                    },
                    supply: {
                        sum: '0'
                    },
                    date: date
                };

            } else {
                dataFlow.day = day;
            }

            return callback();

        });

    }, function (callback) {

        var dayBN = self._toDayBN(dataFlow.day);

        dayBN.totalTransactionFees.sum = dayBN.totalTransactionFees.sum.plus(fee.toString());
        dayBN.totalTransactionFees.count = dayBN.totalTransactionFees.count.plus(1);

        dayBN.totalBlocks.count = dayBN.totalBlocks.count.plus(1);

        dayBN.numberOfTransactions.count = dayBN.numberOfTransactions.count.plus(block.tx.length);

        dayBN.totalOutputVolume.sum = dayBN.totalOutputVolume.sum.plus(totalOutputs.toString());

        if (block.difficulty && block.flags === bitcore.Block.PROOF_OF_STAKE) {
            dayBN.difficulty.sum = dayBN.difficulty.sum.plus(block.difficulty.toString());
            dayBN.difficulty.count = dayBN.difficulty.count.plus(1);
        }

        if (subsidy) {

            if (block.flags === bitcore.Block.PROOF_OF_STAKE) {
                dayBN.stake.sum = dayBN.stake.sum.plus(subsidy);
            }

            dayBN.supply.sum = SupplyHelper.getTotalSupplyByHeight(block.height).mul(1e8);

        }

        return self.statisticDayRepository.createOrUpdateDay(new Date(date), dayBN, function (err) {
            return callback(err);
        });

    }], function (err) {
        return next(err);
    });

};

/**
 *
 * @param {Object} day
 * @return {{totalTransactionFees: {sum, count}, numberOfTransactions: {count}, totalOutputVolume: {sum}, totalBlocks: {count}, difficulty: {sum, count}, stake: {sum}, supply: {sum}, date}}
 * @private
 */
StatisticService.prototype._toDayBN = function (day) {
    return {
        totalTransactionFees: {
            sum: new BigNumber(day.totalTransactionFees.sum),
            count: new BigNumber(day.totalTransactionFees.count)
        },
        numberOfTransactions: {
            count: new BigNumber(day.numberOfTransactions.count)
        },
        totalOutputVolume: {
            sum: new BigNumber(day.totalOutputVolume.sum)
        },
        totalBlocks: {
            count: new BigNumber(day.totalBlocks.count)
        },
        difficulty: {
            sum: new BigNumber(day.difficulty.sum),
            count: new BigNumber(day.difficulty.count)
        },
        stake: {
            sum: new BigNumber(day.stake.sum)
        },
        supply: {
            sum: new BigNumber(day.supply.sum)
        },
        date: day.date
    };
};

/**
 * helper to convert timestamps to yyyy-mm-dd format
 * @param {Date} date
 * @returns {string} yyyy-mm-dd format
 */
StatisticService.prototype.formatTimestamp = function(date) {
    var yyyy = date.getUTCFullYear().toString();
    var mm = (date.getUTCMonth() + 1).toString(); // getMonth() is zero-based
    var dd = date.getUTCDate().toString();

    return yyyy + '-' + (mm[1] ? mm : '0' + mm[0]) + '-' + (dd[1] ? dd : '0' + dd[0]); //padding
};

/**
 *
 * @param {number} height
 * @returns {boolean}
 * @private
 */
StatisticService.prototype._rapidProtectedUpdateTip = function(height) {

    var self = this;

    if (height > this.lastTipHeight) {
        this.lastTipHeight = height;
    }

    if (this.lastTipInProcess || height < this.lastCheckedBlock) {
        return false;
    }

    this.lastTipInProcess = true;

    self.common.log.info('[STATISTICS Service] start upd from ', self.lastCheckedBlock + 1 , ' to ', height);

    return this._getLastBlocks(height, function (err) {

        self.lastTipInProcess = false;

        if (err) {
            return false;
        }

        self.emit('updated', {height: height});

        self.common.log.info('[STATISTICS Service] updated to ', height);

        if (self.lastTipHeight !== height) {
            self._rapidProtectedUpdateTip(self.lastTipHeight);
        }

    });

};

/**
 *
 * @param {Number} days
 * @param {Function} next
 * @return {*}
 */
StatisticService.prototype.getStats = function (days, next) {

    var self = this,
        currentDate = new Date(),
        formattedDate = this.formatTimestamp(currentDate),
        from = new Date(formattedDate);

    from.setDate(from.getDate() - days);

    return self.statisticDayRepository.getStats(from, new Date(formattedDate), function (err, stats) {
        return next(err, stats);
    });

};

/**
 *
 * @param {Number} days
 * @param {Function} next
 */
StatisticService.prototype.getDifficulty = function (days, next) {

    var self = this;

    return self.getStats(days, function (err, stats) {

        if (err) {
            return next(err);
        }

        var results = [];

        stats.forEach(function (day) {

            results.push({
                date: self.formatTimestamp(day.date),
                sum: day.difficulty.sum > 0 && day.difficulty.count > 0 ? new BigNumber(day.difficulty.sum).dividedBy(day.difficulty.count).toNumber() : 0
            });

        });

        return next(err, results);

    });

};

/**
 *
 * @param {Number} days
 * @param {Function} next
 */
StatisticService.prototype.getSupply = function (days, next) {

    var self = this;

    return self.getStats(days, function (err, stats) {

        if (err) {
            return next(err);
        }

        var results = [];

        stats.forEach(function (day) {

            var sumBN = new BigNumber(day.supply.sum);

            results.push({
                date: self.formatTimestamp(day.date),
                sum: sumBN.gt(0) ? sumBN.dividedBy(1e8).toString(10) : '0'
            });

        });

        return next(err, results);

    });

};

/**
 *
 * @param {Number} days
 * @param {Function} next
 */
StatisticService.prototype.getOutputs = function (days, next) {

    var self = this;

    return self.getStats(days, function (err, stats) {

        if (err) {
            return next(err);
        }

        var results = [];

        stats.forEach(function (day) {

            results.push({
                date: self.formatTimestamp(day.date),
                sum: day.totalOutputVolume && day.totalOutputVolume.sum > 0 ? day.totalOutputVolume.sum : 0
            });

        });

        return next(err, results);

    });

};

/**
 *
 * @param {Number} days
 * @param {Function} next
 */
StatisticService.prototype.getTransactions = function (days, next) {

    var self = this;

    return self.getStats(days, function (err, stats) {

        if (err) {
            return next(err);
        }

        var results = [];

        stats.forEach(function (day) {

            results.push({
                date: self.formatTimestamp(day.date),
                transaction_count: parseInt(day.numberOfTransactions.count),
                block_count: parseInt(day.totalBlocks.count)
            });

        });

        return next(err, results);

    });

};

/**
 *
 * @param {Number} days
 * @param {Function} next
 */
StatisticService.prototype.getFees = function (days, next) {

    var self = this;

    return self.getStats(days, function (err, stats) {

        if (err) {
            return next(err);
        }

        var results = [];

        stats.forEach(function (day) {

            var avg = day.totalTransactionFees.sum > 0 && day.totalTransactionFees.count > 0 ? new BigNumber(day.totalTransactionFees.sum).dividedBy(day.totalTransactionFees.count).toNumber() : 0;

            results.push({
                date: self.formatTimestamp(day.date),
                fee: avg
            });

        });

        return next(err, results);

    });

};

/**
 *
 * @param {Number} days
 * @param {Function} next
 */
StatisticService.prototype.getStakes = function (days, next) {

    var self = this,
        dataFlow = {
            totalSubsidyPOSAmount: 0,
            stats: []
        };

    return async.waterfall([function (callback) {
        return self.totalStatisticRepository.getPOSTotalAmount(function (err, value) {

            if (err) {
                return callback(err);
            }

            dataFlow.totalSubsidyPOSAmount = value;

            return callback();
        });
    }, function (callback) {
        return self.getStats(days, function (err, stats) {
            if (err) {
                return callback(err);
            }

            dataFlow.stats = stats;

            return callback();
        });
    }], function (err) {

        if (err) {
            return next(err);
        }

        var results = [],
            totalSubsidyPOSAmount = dataFlow.totalSubsidyPOSAmount;

        dataFlow.stats.forEach(function (day) {

            results.push({
                date: self.formatTimestamp(day.date),
                sum: totalSubsidyPOSAmount && day.stake && day.stake.sum > 0 ? new BigNumber(day.stake.sum).dividedBy(totalSubsidyPOSAmount).toNumber() : 0
            });

        });

        return next(err, results);

    });

};

/**
 *
 * @param {Function} nextCb
 * @return {*}
 */
StatisticService.prototype.getTotal = function(nextCb) {

    var self = this,
        initHeight = self.lastCheckedBlock,
        height = initHeight,
        next = true,
        sumBetweenTime = 0,
        countBetweenTime = 0,
        numTransactions = 0,
        minedBlocks = 0,
        minedCurrencyAmount = 0,
        allFee = 0,
        sumDifficulty = 0,
        countDifficulty = 0,
        totalOutputsAmount = 0;

    while(next && height > 0) {

        var currentElement = self.blocksByHeight.get(height),
            subsidy = self.subsidyByBlockHeight.get(height),
            outputAmount = self.outputsByHeight.get(height);

        if (currentElement) {

            var nextElement = self.blocksByHeight.get(height + 1),
                fee = self.feeByHeight.get(height);

            if (nextElement) {
                sumBetweenTime += (nextElement.time - currentElement.time);
                countBetweenTime++;
            }

            numTransactions += currentElement.tx.length;
            minedBlocks++;

            var difficulty = currentElement.difficulty;

            if (currentElement.flags === bitcore.Block.PROOF_OF_STAKE && difficulty) {
                sumDifficulty += difficulty;
                countDifficulty++;
            }

            if (subsidy && currentElement.flags === bitcore.Block.PROOF_OF_STAKE) {
                minedCurrencyAmount += subsidy;
            }

            if (fee) {
                allFee += fee;
            }

            if (outputAmount) {
                totalOutputsAmount += outputAmount;
            }

        } else {
            next = false;
        }

        height--;

    }

    return self.totalStatisticRepository.getPOSTotalAmount(function (err, totalSubsidyPOSAmount) {

        var result = {
            n_blocks_mined: minedBlocks,
            time_between_blocks: sumBetweenTime && countBetweenTime ? sumBetweenTime / countBetweenTime : 0,
            mined_currency_amount: minedCurrencyAmount,
            transaction_fees: allFee,
            number_of_transactions: numTransactions,
            outputs_volume: totalOutputsAmount,
            difficulty: sumDifficulty && countDifficulty ? sumDifficulty / countDifficulty : 0,
            stake: minedCurrencyAmount && totalSubsidyPOSAmount ? minedCurrencyAmount / totalSubsidyPOSAmount : 0
        };

        return nextCb(null, result);

    });

};

module.exports = StatisticService;