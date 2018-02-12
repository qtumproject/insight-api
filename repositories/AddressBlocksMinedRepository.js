const async = require('async');
const AddressBlocksMined = require('../models/AddressBlocksMined');

function AddressBlocksMinedRepository () {}

/**
 *
 * @param {Object} data
 * @param {String} data.address
 * @param {Function} next
 * @return {*}
 */
AddressBlocksMinedRepository.prototype.createOrUpdateAddress = function (data, next) {

    var dataFlow = {
        row: null
    };

    return async.waterfall([function (callback) {
        return AddressBlocksMined.findOne({address: data.address}, function(err, row) {

            if (err) {
                return callback(err);
            }

            dataFlow.row = row;

            return callback();

        });
    }, function (callback) {

        if (dataFlow.row) {
            return AddressBlocksMined.update({address: data.address}, {$inc: {count: 1}}, function (err) {
                return callback(err);
            });
        } else {
            return AddressBlocksMined.create({address: data.address, count: 1}, function (err) {
                return callback(err);
            });
        }

    }], function (err) {
        return next(err);
    });

};

/**
 *
 * @param {Array} addresses
 * @param {Function} next
 */
AddressBlocksMinedRepository.prototype.getMinedBlocksByAddresses = function (addresses, next) {
    return AddressBlocksMined.find({address: {$in: addresses}}, function (err, items) {
        return next(err, items);
    })
};

module.exports = AddressBlocksMinedRepository;