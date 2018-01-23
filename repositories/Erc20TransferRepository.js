const async = require('async');
const Erc20Transfer = require('../models/Erc20Transfer');

function Erc20TransferRepository () {}


/**
 *
 * @param {String} contractAddress
 * @param {Object} options
 * @return {{contract_address: *}}
 * @private
 */
Erc20TransferRepository.prototype._getTransfersConditions = function (contractAddress, options) {

    var where = {contract_address: contractAddress};

    if (options && options.addresses && options.addresses.length) {
        where.$or = [{from : {$in: options.addresses}}, {to : {$in: options.addresses}}];
    }

    if (options && (options.from_block || options.to_block)) {
        where['block_height'] = {};
    }

    if (options && options.from_block) {
        where['block_height']['$gte'] = options.from_block;
    }

    if (options && options.to_block) {
        where['block_height']['$lte'] = options.to_block;
    }

    if (options && (options.from_date_time || options.to_date_time)) {
        where['block_date_time'] = {};
    }

    if (options && options.from_date_time) {
        where['block_date_time']['$gte'] = options.from_date_time;
    }

    if (options && options.to_date_time) {
        where['block_date_time']['$lte'] = options.to_date_time;
    }

    return where;
};
/**
 *
 * @param {String} contractAddress
 * @param {Object} options
 * @param {Array?} options.addresses
 * @param {Function} next
 * @return {*}
 */
Erc20TransferRepository.prototype.getCountTransfers = function (contractAddress, options, next) {
    return Erc20Transfer.count(this._getTransfersConditions(contractAddress, options), function(err, count) {
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

    return Erc20Transfer.find(this._getTransfersConditions(contractAddress, options), {}, {sort: {block_height: -1}, limit: options.limit, skip: options.offset}, function(err, transfers) {
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