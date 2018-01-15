'use strict';

var async = require('async');
var bitcore = require('qtumcore-lib');
var BigNumber = require('bignumber.js');
var LRU = require('lru-cache');
var Common = require('../lib/common');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

//TODO:: mv to service

function StatisticService(options) {

    this.node = options.node;
    this.statisticDayRepository = options.statisticDayRepository;

    this.addressBalanceService = options.addressBalanceService;


    /**
     * Statistic/Total
     */

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
    this.totalSubsidityPOSAmount = 0;
    this.totalSubsidityAmount = new BigNumber(0);

    /**
     *
     * @type {Common}
     */
    this.common = new Common({log: this.node.log});

    this.lastTipHeight = 0;
    this.lastTipInProcess = false;
    this.lastTipTimeout = false;

    this.node.services.qtumd.on('tip', this._rapidProtectedUpdateTip.bind(this));
    this._rapidProtectedUpdateTip(this.node.services.qtumd.height);

}

util.inherits(StatisticService, EventEmitter);

StatisticService.DEFAULT_STATISTICS_COUNT_DAYS = 365; //1 year
StatisticService.DEFAULT_STATISTICS_MAX_COUNT_DAYS = 365 * 2; //2 year


StatisticService.prototype._getLastBlocks = function(height, next) {

    var self = this,
        blocks = [];

    for (var i = self.lastCheckedBlock + 1; i <= height; i++) {
        blocks.push(i);
    }


    return async.eachSeries(blocks, function (blockHeight, callback) {

        var dataFlow = {
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
                return callback(err);
            }

            if (self.knownBlocks.get(blockHeight)) {
                return callback();
            }

            self.knownBlocks.set(blockHeight, true);

            self.lastCheckedBlock = blockHeight;

            var block = dataFlow.blockJson,
                subsidy = dataFlow.subsidy,
                fee = dataFlow.fee,
                totalOutputs = dataFlow.totalOutputs,
                currentDate = new Date();

            var date = new Date(block.time * 1000),
                formattedDate = self.formatTimestamp(date);

            self.updateOrCreateDay(formattedDate, dataFlow, function () {

            });


        });

    });


};

/**
 *
 */
StatisticService.prototype.updateOrCreateDay = function (date, data, next) {

    var self = this;

    var block = data.blockJson,
        subsidy = data.subsidy,
        fee = data.fee,
        totalOutputs = data.totalOutputs,
        currentDate = new Date();


    var dataFlow = {
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
                        sum: (new BigNumber(100000000)).plus((block.height - 5000) * 4).toString(10)
                    }
                };
            } else {
                dataFlow.day = day;
            }
            return callback();
        });
    }, function (callback) {

        console.log(dataFlow.day);

        return self.statisticDayRepository.createOrUpdateDay(new Date(date), dataFlow.day, function (err, day) {

        });


        return callback();

    }], function (err) {
        return next(err);
    });
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

    if (this.lastTipInProcess) {
        return false;
    }

    this.lastTipInProcess = true;

    self.common.log.info('[STATISTICS Service] start upd from ', self.lastCheckedBlock + 1 , ' to ', height);

    return this._getLastBlocks(height, function (err) {

        self.lastTipInProcess = false;

        if (err) {
            return false;
        }

        self.emit('updated');

        self.common.log.info('[STATISTICS Service] updated to ', height);

        if (self.lastTipHeight !== height) {
            self._rapidProtectedUpdateTip(self.lastTipHeight);
        }

    });

};




module.exports = StatisticService;