'use strict';

var async = require('async');
var bitcore = require('bitcore-lib');
var _ = bitcore.deps._;
var BN = bitcore.crypto.BN;
var LRU = require('lru-cache');
var Common = require('./common');

function StatisticController(options) {

    this.node = options.node;

    this.node.services.bitcoind.on('block', this._blockEventHandler.bind(this));
    this.node.services.bitcoind.on('synced', this._blocksSynced.bind(this));

    this.countTrxsByDaysCache = LRU(options.dayTrxCacheSize || StatisticController.DEFAULT_TRX_DAY_CACHE_SIZE);
    this.countTrxDays = options.countTrxDays || StatisticController.DEFAULT_TRX_COUNT_DAYS;

    this.common = new Common({log: this.node.log});
    this.allCountTrxByDaysCacheIsInit = false;
}


StatisticController.DEFAULT_TRX_COUNT_DAYS = 14;
StatisticController.DEFAULT_TRX_DAY_CACHE_SIZE = 15;


StatisticController.prototype.transactions = function(req, res) {

    var self = this,
        dates = [],
        results = [];

    for (var i = 0; i < self.countTrxDays; i++) {
        var currentDate = new Date();
        currentDate.setDate(currentDate.getDate() - i);
        dates.push(this.formatTimestamp(currentDate));
    }

    dates.forEach(function (date) {
        var cachedDay = self.countTrxsByDaysCache.get(date);

        if (cachedDay) {
            results.push({
                date: date,
                transaction_count: cachedDay.transaction_count,
                block_count: cachedDay.block_count
            });
        }
    });

    return res.jsonp(results);

};

//helper to convert timestamps to yyyy-mm-dd format
StatisticController.prototype.formatTimestamp = function(date) {
    var yyyy = date.getUTCFullYear().toString();
    var mm = (date.getUTCMonth() + 1).toString(); // getMonth() is zero-based
    var dd = date.getUTCDate().toString();

    return yyyy + '-' + (mm[1] ? mm : '0' + mm[0]) + '-' + (dd[1] ? dd : '0' + dd[0]); //padding
};

StatisticController.prototype._updateTrxsCountByDaysCache = function (block) {
    var self = this,
        date = new Date(block.header.time * 1000),
        formattedDate = self.formatTimestamp(date),
        count = block.transactions.length,
        cachedDay = self.countTrxsByDaysCache.get(formattedDate);

    if (!cachedDay) {
        self.countTrxsByDaysCache.set(formattedDate, {
            date: formattedDate,
            block_count: 1,
            transaction_count: count
        });
    } else {
        cachedDay.transaction_count += count;
        cachedDay.block_count += 1;
        self.countTrxsByDaysCache.set(formattedDate, cachedDay);
    }

};

StatisticController.prototype._setAllCountTransactionsByDaysCache = function (next) {

    var self = this;

    return this.node.getInfo(function (err, info) {
        var currentDate = new Date();
        currentDate.setDate(currentDate.getDate() - self.countTrxDays);
        var formatLastDate = self.formatTimestamp(currentDate);
        var min = Math.round((new Date(formatLastDate)).getTime() / 1000);
        var list = [];
        var time = 0;

        for (var i = 0; i <= info.blocks; i++) {
            list.push(i);
        }

        list.reverse();

        self.common.log.info('[Statistic]: Start update ...');

        return async.whilst(
            function() {
                return (list.length && time >= min) || time === 0;
            },
            function(callback) {
                var spliceItem = list.splice(0, 1),
                    height = spliceItem[0];

                return async.waterfall([function (callback) {
                    self.node.services.bitcoind.getBlockHeader(height, function(err, info) {
                        return callback(err, info);
                    });
                }, function (info, callback) {
                    return self.node.getBlock(info.hash, function(err, block) {

                        if((err && err.code === -5) || (err && err.code === -8)) {
                            return callback(err);
                        } else if(err) {
                            return callback(err);
                        }

                        time = block.header.time;

                        self._updateTrxsCountByDaysCache(block);

                        return callback();
                    });
                }], function () {
                    return callback();
                });

            },
            function (err) {
                return next(err);
            }
        );


    });

};

StatisticController.prototype._blocksSynced = function() {
    var self = this;
    if (!this.allCountTrxByDaysCacheIsInit) {
        this.allCountTrxByDaysCacheIsInit = true;
        this._setAllCountTransactionsByDaysCache(function () {
            self.common.log.info('[Statistic]: Updated');
        });
    }
};

StatisticController.prototype._blockEventHandler = function(hashBuffer) {

    var self = this;

    return self.node.getBlock(hashBuffer.toString('hex'), function(err, block) {
        if (block && block.header.time) {
            return self._updateTrxsCountByDaysCache(block);
        }
    });

};

module.exports = StatisticController;