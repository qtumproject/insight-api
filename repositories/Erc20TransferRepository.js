const async = require('async');
const Erc20Transfer = require('../models/Erc20Transfer');

function Erc20TransferRepository () {}

/**
 *
 * @param {String} contractAddress
 * @param {Object} options
 * @param {Array?} options.addresses
 * @param {Function} next
 * @return {*}
 */
Erc20TransferRepository.prototype.getCountTransfers = function (contractAddress, options, next) {

    var where = {contract_address: contractAddress};

    if (options && options.addresses && options.addresses.length) {
        where.$or = [{from : {$in: options.addresses}}, {to : {$in: options.addresses}}];
    }

    return Erc20Transfer.count(where, function(err, count) {
        return next(err, count);
    });

};
/**
 *
 * @param {String} txHash
 * @param {Function} next
 * @return {*}
 */
Erc20TransferRepository.prototype.isTransfersExistsByTxHash = function (txHash, next) {
    return Erc20Transfer.findOne({tx_hash: txHash}, function(err, transfer) {
        return next(err, !!transfer);
    });
};

/**
 *
 * @param {String} contractAddress
 * @param {Object} options
 * @param {Number} options.limit
 * @param {Number} options.offset
 * @param {Array?} options.addresses
 * @param {Function} next
 */
Erc20TransferRepository.prototype.fetchTransfers = function (contractAddress, options, next) {

    var where = {contract_address: contractAddress};

    if (options && options.addresses && options.addresses.length) {
        where.$or = [{from : {$in: options.addresses}}, {to : {$in: options.addresses}}];
    }

    return Erc20Transfer.find(where, {}, {sort: {created_at: -1}, limit: options.limit, skip: options.offset}, function(err, transfers) {
        return next(err, transfers);
    });

};
/**
 *
 * @param {Object} data
 * @param {Function} next
 */
Erc20TransferRepository.prototype.createOrUpdateTx = function (data, next) {
    return Erc20Transfer.findOneAndUpdate({tx_hash: data.tx_hash, log_idx: data.log_idx, contract_address: data.contract_address}, data, {upsert: true, new: true}, function(err, row) {
        return next(err, row);
    });

};

module.exports = Erc20TransferRepository;