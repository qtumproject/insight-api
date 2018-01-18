const TotalStatistic = require('../models/TotalStatistic');
const async = require('async');

function TotalStatisticRepository () {}

TotalStatisticRepository.prototype.createOrUpdatePosTotalAmount = function(value, next) {
    return TotalStatistic.findOneAndUpdate({type: TotalStatistic.TYPES.posTotalAmount}, {value: value}, {upsert: true, new: true}, function(err, row) {
        return next(err, row);
    });
};

TotalStatisticRepository.prototype.getPOSTotalAmount = function(next) {
    return TotalStatistic.findOne({type: TotalStatistic.TYPES.posTotalAmount}, function(err, totalAmount) {
        return next(err, totalAmount ? totalAmount.value : '0');
    });
};

module.exports = TotalStatisticRepository;