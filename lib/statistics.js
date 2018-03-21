'use strict';

var async = require('async');
var _ = require('lodash');
var BigNumber = require('bignumber.js');
var Common = require('./common');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

function StatisticsController(options) {

	this.node = options.node;
	this.addressBalanceService = options.addressBalanceService;
	this.statisticService = options.statisticService;
	this.addressBlocksMinedRepository = options.addressBlocksMinedRepository;

    /**
     *
     * @type {Common}
     */
	this.common = new Common({log: this.node.log});

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

StatisticsController.prototype.balanceIntervals = function(req, res) {

    var self = this;

    return this.addressBalanceService.getIntervals(function (err, intervals) {

        if (err) {
            return self.common.handleErrors(err, res);
        }

        return res.jsonp(intervals);

    });

};

StatisticsController.prototype.getRicherThan = function(req, res) {

    var self = this;

    return this.addressBalanceService.getRicherThan(function (err, items) {

        if (err) {
            return self.common.handleErrors(err, res);
        }

        return res.jsonp(items);

    });

};

StatisticsController.prototype.getRichestAddressesList = function (req, res) {

    var self = this,
        dataFlow = {
            addressesList: [],
            addressesMinedMap: {}
        };

    return async.waterfall([function (callback) {
        return self.addressBalanceService.getRichestAddressesList(function (err, items) {

            if (err) {
                return callback(err);
            }

            dataFlow.addressesList = items;

            return callback();

        });
    }, function (callback) {
        if (!dataFlow.addressesList.length) {
            return callback();
        }

        return self.addressBlocksMinedRepository.getMinedBlocksByAddresses(dataFlow.addressesList.map(function (item) {
            return item.address;
        }), function (err, addressesMined) {

            if (err) {
                return callback(err);
            }

            dataFlow.addressesMinedMap = _.reduce(addressesMined, function(addressesMinedMap, item) {
                    addressesMinedMap[item.address] = item.count;
                    return addressesMinedMap;
                } , {});

            return callback();
        })
    }], function (err) {

        if (err) {
            return self.common.handleErrors(err, res);
        }
        
        return res.jsonp(dataFlow.addressesList.map(function (item) {
            return {
                address: item.address,
                blocks_mined: dataFlow.addressesMinedMap[item.address] ? dataFlow.addressesMinedMap[item.address] : 0,
                balance: item.balance
            }
        }));
    });



};

StatisticsController.prototype.totalSupply = function(req, res) {

    var totalSupply = this.statisticService.getTotalSupply().toString();

    if (req.query.format === 'object') {
        return res.jsonp({
            supply: totalSupply
        });
    }

    return res.status(200).send(totalSupply);

};

StatisticsController.prototype.circulatingSupply = function(req, res) {
    
    var totalSupplyBN = this.statisticService.getTotalSupply();
    var circulatingSupply = totalSupplyBN.minus('12000000').toString();

    if (req.query.format === 'object') {
        return res.jsonp({
            circulatingSupply: circulatingSupply
        });
    }

    return res.status(200).send(circulatingSupply);

}

StatisticsController.prototype.difficulty = function(req, res) {

    var self = this,
        days = self.getTimeSpan(req);

    return self.statisticService.getDifficulty(days, function (err, diffs) {

        if (err) {
            return self.common.handleErrors(err, res);
        }

        return res.jsonp(diffs);

    });

};

StatisticsController.prototype.stake = function(req, res) {

    var self = this,
        days = self.getTimeSpan(req);

    return self.statisticService.getStakes(days, function (err, diffs) {

        if (err) {
            return self.common.handleErrors(err, res);
        }

        return res.jsonp(diffs);

    });

};

StatisticsController.prototype.supply = function(req, res) {

    var self = this,
        days = self.getTimeSpan(req);

    return self.statisticService.getSupply(days, function (err, diffs) {

        if (err) {
            return self.common.handleErrors(err, res);
        }

        return res.jsonp(diffs);

    });

};

StatisticsController.prototype.outputs = function(req, res) {

    var self = this,
        days = self.getTimeSpan(req);

    return self.statisticService.getOutputs(days, function (err, diffs) {

        if (err) {
            return self.common.handleErrors(err, res);
        }

        return res.jsonp(diffs);

    });

};


StatisticsController.prototype.transactions = function(req, res) {

    var self = this,
        days = self.getTimeSpan(req);

    return self.statisticService.getTransactions(days, function (err, diffs) {

        if (err) {
            return self.common.handleErrors(err, res);
        }

        return res.jsonp(diffs);

    });

};

StatisticsController.prototype.fees = function(req, res) {

    var self = this,
        days = self.getTimeSpan(req);

    return self.statisticService.getFees(days, function (err, diffs) {

        if (err) {
            return self.common.handleErrors(err, res);
        }

        return res.jsonp(diffs);

    });

};


StatisticsController.prototype.total = function(req, res) {

    var self = this;

    return self.statisticService.getTotal(function (err, result) {

        if (err) {
            return self.common.handleErrors(err, res);
        }

        return res.jsonp(result);

    });

};

module.exports = StatisticsController;