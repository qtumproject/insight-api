const LastBlock = require('../models/LastBlock');
const async = require('async');

function LastBlockRepository () {}

LastBlockRepository.prototype.updateOrAddLastBlock = function (last_block_number, type, next) {
    return LastBlock.findOneAndUpdate({type: type}, {
            last_block_number: last_block_number,
            type: type
        }, {upsert: true}, function (err, key) {
            return next(err, key);
    });
};

LastBlockRepository.prototype.setLastBlockType = function(type, updateFrom, next) {

    var self = this;

    return async.waterfall([function(callback) {

            return self.getLastBlockByType(type, function(err, existingType) {
                return callback(err, existingType);
            });

        }, function(existingType, callback) {

            if (!existingType) {

                return LastBlock.create({
                        type: type,
                        last_block_number: 0
                    }, function(err, row) {
                        return callback(err, row);
                });

            } else {
                return callback(null, existingType);
            }

    }, function(existingType, callback) {

        if (updateFrom > existingType.last_block_number) {

            return self.updateOrAddLastBlock(updateFrom, type, function(err) {
                    return callback(err);
              });

        } else {
            return callback();
        }

    }], function(err) {
        return next(err);
    });

};

LastBlockRepository.prototype.getLastBlockByType = function(type, next) {
    return LastBlock.findOne({type: type}, function(err, existingType) {
            return next(err, existingType);
    });
};

module.exports = LastBlockRepository;