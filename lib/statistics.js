'use strict';

var async = require('async');
var bitcore = require('qtumcore-lib');
var BigNumber = require('bignumber.js');
var LRU = require('lru-cache');
var Common = require('./common');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

//TODO:: mv to service

function StatisticsController(options) {

	this.node = options.node;

	this.node.services.bitcoind.on('tip', this._rapidProtectedUpdateTip.bind(this));

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

}

util.inherits(StatisticsController, EventEmitter);

StatisticsController.DEFAULT_STATISTICS_COUNT_DAYS = 365; //1 year
StatisticsController.DEFAULT_STATISTICS_MAX_COUNT_DAYS = 365 * 2; //2 year

StatisticsController.prototype.getTimeSpan = function(req) {

    var days = req.query.days,
        defaultCountDays = StatisticsController.DEFAULT_STATISTICS_COUNT_DAYS,
        maxDays = StatisticsController.DEFAULT_STATISTICS_MAX_COUNT_DAYS;

    if (days === 'all') {
        return maxDays;
    }

    if (days && !isNaN(parseInt(days)) && days > 0) {

        if (maxDays < parseInt(days)) {
            return maxDays;
        }

        return parseInt(days);
    }

    return defaultCountDays;
};

StatisticsController.prototype.supply = function(req, res) {

    var supply = this.totalSubsidityAmount && this.totalSubsidityAmount.gt(0) ? this.totalSubsidityAmount.dividedBy(1e8).toString(10) : '0';

    if (req.query.format === 'object') {
        return res.jsonp({
            supply: supply
        });
    }

    return res.status(200).send(supply);

};

StatisticsController.prototype.difficulty = function(req, res) {

    var self = this,
        currentDate = new Date(),
        formattedDate = this.formatTimestamp(currentDate),
        results = [],
        days = self.getTimeSpan(req),
        iterator = 0;

    while(self.statisticByDays.get(formattedDate) && days > iterator) {

        var cachedDay = self.statisticByDays.get(formattedDate),
            sum = cachedDay.difficulty && cachedDay.difficulty.sum && cachedDay.difficulty.count ? cachedDay.difficulty.sum / cachedDay.difficulty.count : 0;

        results.push({
            date: formattedDate,
            sum: sum
        });

        currentDate.setDate(currentDate.getDate() - 1);
        formattedDate = this.formatTimestamp(currentDate);
        iterator++;

    }

    return res.jsonp(results);
};

StatisticsController.prototype.stake = function(req, res) {

    var self = this,
        currentDate = new Date(),
        formattedDate = this.formatTimestamp(currentDate),
        results = [],
        days = self.getTimeSpan(req),
        iterator = 0;

    while(self.statisticByDays.get(formattedDate) && days > iterator) {

        var cachedDay = self.statisticByDays.get(formattedDate),
            sum = cachedDay.stake && cachedDay.stake.sum && self.totalSubsidityPOSAmount ? cachedDay.stake.sum / self.totalSubsidityPOSAmount : 0;

        results.push({
            date: formattedDate,
            sum: sum
        });

        currentDate.setDate(currentDate.getDate() - 1);
        formattedDate = this.formatTimestamp(currentDate);
        iterator++;

    }

    return res.jsonp(results);
};

StatisticsController.prototype.outputs = function(req, res) {

    var self = this,
        currentDate = new Date(),
        formattedDate = this.formatTimestamp(currentDate),
        results = [],
        days = self.getTimeSpan(req),
        iterator = 0;

    while(self.statisticByDays.get(formattedDate) && days > iterator) {

        var cachedDay = self.statisticByDays.get(formattedDate),
            sum = cachedDay.totalOutputVolume && cachedDay.totalOutputVolume.sum ? cachedDay.totalOutputVolume.sum : 0;

        results.push({
            date: formattedDate,
            sum: sum
        });

        currentDate.setDate(currentDate.getDate() - 1);
        formattedDate = this.formatTimestamp(currentDate);
        iterator++;

    }

    return res.jsonp(results);
};


StatisticsController.prototype.transactions = function(req, res) {

    var self = this,
        currentDate = new Date(),
        formattedDate = this.formatTimestamp(currentDate),
        results = [],
        days = self.getTimeSpan(req),
        iterator = 0;

    while(self.statisticByDays.get(formattedDate) && days > iterator) {

        var cachedDay = self.statisticByDays.get(formattedDate);

        results.push({
            date: formattedDate,
            transaction_count: cachedDay.numberOfTransactions.count,
            block_count: cachedDay.totalBlocks.count
        });

        currentDate.setDate(currentDate.getDate() - 1);
        formattedDate = this.formatTimestamp(currentDate);
        iterator++;

    }

    return res.jsonp(results);
};

StatisticsController.prototype.fees = function(req, res) {

	var self = this,
		currentDate = new Date(),
    	formattedDate = this.formatTimestamp(currentDate),
		results = [],
        days = self.getTimeSpan(req),
        iterator = 0;

	while(self.statisticByDays.get(formattedDate) && days > iterator) {

    	var cachedDay = self.statisticByDays.get(formattedDate),
			avg = cachedDay.totalTransactionFees.sum && cachedDay.totalTransactionFees.count ? cachedDay.totalTransactionFees.sum / cachedDay.totalTransactionFees.count : 0;

        results.push({
        	date: formattedDate,
            fee: avg
		});

        currentDate.setDate(currentDate.getDate() - 1);
    	formattedDate = this.formatTimestamp(currentDate);
        iterator++;

	}

    return res.jsonp(results);

};


StatisticsController.prototype.total = function(req, res) {

    var self = this,
        height = self.lastCheckedBlock,
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

	var result = {
        n_blocks_mined: minedBlocks,
        time_between_blocks: sumBetweenTime && countBetweenTime ? sumBetweenTime / countBetweenTime : 0,
        mined_currency_amount: minedCurrencyAmount,
        transaction_fees: allFee,
        number_of_transactions: numTransactions,
        outputs_volume: totalOutputsAmount,
        difficulty: sumDifficulty && countDifficulty ? sumDifficulty / countDifficulty : 0,
        stake: minedCurrencyAmount && self.totalSubsidityPOSAmount ? minedCurrencyAmount / self.totalSubsidityPOSAmount : 0
    };

	return res.jsonp(result);
};

/**
 * helper to convert timestamps to yyyy-mm-dd format
 * @param {Date} date
 * @returns {string} yyyy-mm-dd format
 */
StatisticsController.prototype.formatTimestamp = function(date) {
	var yyyy = date.getUTCFullYear().toString();
	var mm = (date.getUTCMonth() + 1).toString(); // getMonth() is zero-based
	var dd = date.getUTCDate().toString();

	return yyyy + '-' + (mm[1] ? mm : '0' + mm[0]) + '-' + (dd[1] ? dd : '0' + dd[0]); //padding
};

StatisticsController.prototype._getLastBlocks = function(height, next) {

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

            currentDate.setDate(currentDate.getDate() - 1);

            var minTimestamp = currentDate.getTime() / 1000,
                maxAge = (block.time - minTimestamp) * 1000;



            if (maxAge > 0) {
            	self.blocksByHeight.set(blockHeight, block, maxAge);
                self.subsidyByBlockHeight.set(blockHeight, subsidy, maxAge);
                self.feeByHeight.set(blockHeight, fee, maxAge);
                self.outputsByHeight.set(blockHeight, totalOutputs, maxAge);
            }

            var date = new Date(block.time * 1000),
                formattedDate = self.formatTimestamp(date),
				cachedStatisticDay = self.statisticByDays.get(formattedDate);

            if (!cachedStatisticDay) {
                cachedStatisticDay = {
                    totalTransactionFees: {
                    	sum: 0,
						count: 0
					},
					numberOfTransactions: {
                    	count: 0
					},
					totalOutputVolume: {
                    	sum: 0
					},
					totalBlocks: {
                    	count: 0
					},
					difficulty: {
                    	sum: 0,
						count: 0
					},
					stake: {
                        sum: 0
					}
                };
			}

            cachedStatisticDay.totalTransactionFees.sum += fee;
            cachedStatisticDay.totalTransactionFees.count += 1;

            cachedStatisticDay.totalBlocks.count += 1;

            cachedStatisticDay.numberOfTransactions.count += block.tx.length;

            cachedStatisticDay.totalOutputVolume.sum += totalOutputs;

            if (block.difficulty && block.flags === bitcore.Block.PROOF_OF_STAKE) {
                cachedStatisticDay.difficulty.sum += block.difficulty;
                cachedStatisticDay.difficulty.count += 1;
            }



            if (subsidy) {

                if (block.flags === bitcore.Block.PROOF_OF_STAKE) {
                    self.totalSubsidityPOSAmount += subsidy;
                    cachedStatisticDay.stake.sum += subsidy;
                }

                self.totalSubsidityAmount = self.totalSubsidityAmount.plus(subsidy);

            }


            self.statisticByDays.set(formattedDate, cachedStatisticDay);

            return callback();
		});

	}, function (err) {

		if (err) {
            self.common.log.error('[STATISTICS] Update Error', err);
			return next(err);
		}

        return next();
	});

};

/**
 *
 * @param {number} height
 * @returns {boolean}
 * @private
 */
StatisticsController.prototype._rapidProtectedUpdateTip = function(height) {

	var self = this;

	if (height > this.lastTipHeight) {
        this.lastTipHeight = height;
    }


	if (this.lastTipInProcess) {
		return false;
	}

	this.lastTipInProcess = true;

    self.common.log.info('[STATISTICS] start upd from ', self.lastCheckedBlock + 1 , ' to ', height);

    return this._getLastBlocks(height, function (err) {

    	self.lastTipInProcess = false;

    	if (err) {
    	    return false;
        }

        self.emit('updated');

        self.common.log.info('[STATISTICS] updated to ', height);

        if (self.lastTipHeight !== height) {
        	self._rapidProtectedUpdateTip(self.lastTipHeight);
		}

	});

};

module.exports = StatisticsController;