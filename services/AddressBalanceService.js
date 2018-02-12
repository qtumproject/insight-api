var Common = require('../lib/common');
var async = require('async');
var BigNumber = require('bignumber.js');
var TYPE = 'ADDRESS_BALANCE';
var MIN_BORDER = 0.001;

function AddressBalanceService(options) {

    this.common = new Common({log: options.node.log});
    this.lastBlockRepository = options.lastBlockRepository;
    this.addressBalanceRepository = options.addressBalanceRepository;
    this.marketsService = options.marketsService;
    this.node = options.node;
    this.updateFromBlockHeight = 0;

    this.lastTipHeight = 0;
    this.lastTipInProcess = false;
    this.lastTipTimeout = false;
    this.lastCheckedBlock = 0;

    this.richerThanInProcess = false;

    this.cacheIntervals = [];
    this.richerThanCache = [];
    this.richestAddressesListCache = [];

}

/**
 *
 * @param {Function} next
 * @return {*}
 */
AddressBalanceService.prototype.getIntervals = function (next) {
    return next(null, this.cacheIntervals);
};

/**
 *
 * @param {Function} next
 * @return {*}
 */
AddressBalanceService.prototype.getRicherThan = function (next) {
    return next(null, this.richerThanCache);
};

/**
 *
 * @param {Function} next
 * @return {*}
 */
AddressBalanceService.prototype.getRichestAddressesList = function (next) {
    return next(null, this.richestAddressesListCache);
};

/**
 *
 * @param {Function} next
 * @return {*}
 */
AddressBalanceService.prototype.updateRicherThanCache = function (next) {

    if (this.richerThanInProcess) {
       return next();
    }

    this.richerThanInProcess = true;

    var self = this,
        dataFlow = {
            info: null,
            items: []
        };

    return async.waterfall([function (callback) {
        return self.marketsService.getInfo(function (err, info) {

            if (err) {
                return callback(err);
            }

            dataFlow.info = info;

            return callback();
        });
    }, function (callback) {
        return async.eachSeries([1, 100, 1000, 10000, 100000, 1000000, 10000000], function (greaterThanUsd, callback) {

            if (dataFlow.info.price_usd > 0) {
                return self.addressBalanceRepository.getCountAddressesGreaterThan(greaterThanUsd / dataFlow.info.price_usd, function (err, result) {

                    if (err) {
                        return callback(err);
                    }

                    dataFlow.items.push({
                        amount_usd: greaterThanUsd,
                        count_addresses: result
                    });

                    return callback();
                });
            }

            return callback();

        }, function (err) {
            return callback(err);
        });

    }], function (err) {

        self.richerThanInProcess = false;

        if (err) {
            return next(err);
        }

        self.richerThanCache = dataFlow.items;

        return next();

    });

};

/**
 *
 * @param {Function} next
 * @return {*}
 */
AddressBalanceService.prototype.updateCacheIntervals = function (next) {

    var self = this;

    return async.waterfall([function (callback) {

        return self.addressBalanceRepository.getMaxBalance(function (err, addressBalance) {

            if (err) {
                return callback(err);
            }

            if (!addressBalance) {
                return callback(null, []);
            }

            var minBorder = MIN_BORDER,
                intervals = [],
                balance = new BigNumber(addressBalance.balance.toString()),
                prevBorder,
                nextBorder = minBorder;

            intervals.push({
                max: minBorder,
                min: 0,
                count: 0,
                sum: 0
            });

            while (balance.greaterThanOrEqualTo(nextBorder)) {

                prevBorder = nextBorder;
                nextBorder = nextBorder * 10;

                intervals.push({
                    max: nextBorder,
                    min: prevBorder,
                    count: 0,
                    sum: 0
                });

            }

            return callback(null, intervals);

        });

    }, function (intervals, callback) {

        return async.eachSeries(intervals, function (interval, callback) {
            return self.addressBalanceRepository.getInfoByInterval(interval.min, interval.max, function (err, info) {

                if (err) {
                    return callback(err);
                }

                if (info && info.length) {
                    interval.count =  info[0].count;
                    interval.sum = info[0].sum;
                } else {
                    interval.count =  0;
                    interval.sum = 0;
                }


                return callback();

            });
        }, function (err) {

            if (err) {
                return callback(err);
            }

            self.cacheIntervals = intervals;

            return callback();

        });

    }], function (err) {

        if (err) {
            return next(err);
        }

        return next();
    });

};

/**
 *
 * @param {Function} next
 */
AddressBalanceService.prototype.updateRichestAddressesList = function (next) {

    var self = this;

    return self.addressBalanceRepository.getMaxBalances({limit: 100}, function (err, addressBalances) {

        if (err) {
            return next(err);
        }

        self.richestAddressesListCache = addressBalances;

        return next();

    });
};

/**
 *
 * @param {Function} next
 * @return {*}
 */
AddressBalanceService.prototype.start = function (next) {

    var self = this;

    this.common.log.info('[AddressBalanceService] Start...');

    return async.waterfall([function (callback) {
        return self.lastBlockRepository.setLastBlockType(TYPE, 0, function(err) {

            if (err) {

                self.common.log.error('[AddressBalanceService] setLastBlockType Error', err);

                return callback(err)
            }

            self.common.log.info('[AddressBalanceService] LastBlockType set');

            return callback();

        });
    }, function (callback) {
        return self.lastBlockRepository.getLastBlockByType(TYPE, function(err, existingType) {

            if (err) {

                self.common.log.error('[AddressBalanceService] getLastBlockByType Error', err);

                return callback(err)
            }

            self.lastCheckedBlock = existingType.last_block_number;
            self.common.log.info('[AddressBalanceService] getLastBlockByType set', self.lastCheckedBlock);
            return callback();

        })
    },function (callback) {
        return self.node.getInfo(function (err, data) {

            if (err) {

                self.common.log.error('[AddressBalanceService] getInfo Error', err);

                return callback(err);
            }

            if (data && data.blocks > self.lastTipHeight) {
                self.lastTipHeight = data.blocks;
            }

            self.common.log.info('[AddressBalanceService] lastTipHeight = ', self.lastTipHeight);

            return callback();
        });
    }, function (callback) {
        return self._updateCaches(function (err) {
            return callback(err);
        });
    }], function (err) {

        if (err) {
            self.common.log.error('[AddressBalanceService] start Error', err);
            return next(err);
        }

        self._rapidProtectedUpdateTip(self.lastTipHeight);

        self.node.services.qtumd.on('tip', self._rapidProtectedUpdateTip.bind(self));

        self.marketsService.on('updated', function () {
            return self.updateRicherThanCache(function (err) {
                if (err) {
                    self.common.log.error(err);
                }
            })
        });

        return next();

    });

};

/**
 *
 * @param {number} height
 * @param {function} next
 * @return {*}
 * @private
 */
AddressBalanceService.prototype._processLastBlocks = function(height, next) {

    var self = this,
        blocks = [];

    for (var i = self.lastCheckedBlock + 1; i <= height; i++) {
        blocks.push(i);
    }

    return async.eachSeries(blocks, function (blockHeight, callback) {
        return self.processBlock(blockHeight, function (err) {
            if (err) {
                return callback(err);
            }

            self.lastCheckedBlock = blockHeight;

            return callback();

        });
    }, function (err) {

        if (err) {
            self.common.log.error('[AddressBalanceService] Update Error', err);
            return next(err);
        }

        return self._updateCaches(function (err) {
            return next(err);
        });

    });

};

/**
 *
 * @param {Function} next
 * @return {*}
 * @private
 */
AddressBalanceService.prototype._updateCaches = function(next) {

    var self = this;

    return async.waterfall([function (callback) {
        return self.updateRicherThanCache(function (err) {
            return callback(err);
        });
    }, function (callback) {
        return self.updateCacheIntervals(function(err) {
            return callback(err);
        });
    }, function (callback) {
        return self.updateRichestAddressesList(function(err) {
            return callback(err);
        });
    }], function (err) {
        return next(err);
    });

};
/**
 *
 * @param {Number} height
 * @private
 */
AddressBalanceService.prototype._rapidProtectedUpdateTip = function(height) {

    var self = this;

    if (height > this.lastTipHeight) {
        this.lastTipHeight = height;
    }


    if (this.lastTipInProcess) {
        return false;
    }

    this.lastTipInProcess = true;

    self.common.log.info('[AddressBalanceService] start upd from ', self.lastCheckedBlock + 1 , ' to ', height);

    return this._processLastBlocks(height, function (err) {

        self.lastTipInProcess = false;

        if (err) {
            return false;
        }

        self.common.log.info('[AddressBalanceService] updated to ', height);

        if (self.lastTipHeight !== height) {
            self._rapidProtectedUpdateTip(self.lastTipHeight);
        }

    });

};

/**
 *
 * @param {Number} blockHeight
 * @param {Function} next
 * @return {*}
 */
AddressBalanceService.prototype.processBlock = function (blockHeight, next) {

    var self = this;

    return self.node.getBlockOverview(blockHeight, function (err, block) {

        if (err) {
            return next(err);
        }

        var addressesMap = {};

        return async.waterfall([function (callback) {
            return async.eachSeries(block.txids, function (txHash, callback) {

                return self.node.getJsonRawTransaction(txHash, function (err, transaction) {

                    if (err) {
                        return callback(err);
                    }

                    if (transaction.vin) {
                        transaction.vin.forEach(function(vin) {
                            if (vin.address && !addressesMap[vin.address]) {
                                addressesMap[vin.address] = vin.address;
                            }
                        });
                    }

                    if (transaction.vout) {
                        transaction.vout.forEach(function(vout) {
                            if (vout.scriptPubKey && vout.scriptPubKey.addresses && vout.scriptPubKey.addresses.length) {
                                vout.scriptPubKey.addresses.forEach(function(address) {
                                    if (!addressesMap[address]) {
                                        addressesMap[address] = address;
                                    }
                                });
                            }
                        });

                    }

                    return callback();
                });

            }, function (err) {
                return callback(err);
            });
        }, function (callback) {

            var addresses = Object.keys(addressesMap);

            if (!addresses.length) {
                return callback();
            }

            return async.eachSeries(addresses, function (address, callback) {

                var dataFlow = {
                    balance: 0
                };

                return async.waterfall([function (callback) {
                    return self.node.getAddressBalance(address, {}, function (err, result) {

                        if (err) {
                            return callback(err)
                        }

                        var balanceSat = new BigNumber(result.balance);
                        dataFlow.balance = balanceSat.dividedBy(1e8).toNumber();

                        return callback();

                    });
                }, function (callback) {

                    if (dataFlow.balance > 0) {
                        return self.addressBalanceRepository.createOrUpdateBalance({
                            address: address,
                            balance: dataFlow.balance
                        }, function (err, res) {
                            return callback(err, res);
                        });
                    } else {
                        return self.addressBalanceRepository.removeBalanceByAddress(address, function (err, res) {
                            return callback(err, res);
                        });
                    }

                }], function (err) {
                    return callback(err);
                });

            }, function (err) {
                return callback(err);
            })
        }], function (err) {

            if (err) {
                return next(err);
            }

            return self.lastBlockRepository.updateOrAddLastBlock(block.height, TYPE, function (err) {
                return next(err);
            });

        });

    });

};

module.exports = AddressBalanceService;