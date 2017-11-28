const async = require('async');
const Erc20Contracts = require('../models/Erc20Contracts');

function Erc20ContractsRepository () {}

/**
 *
 * @param {Array} contractAddresses
 * @param {Function} next
 * @return {*}
 */
Erc20ContractsRepository.prototype.fetchContracts = function (contractAddresses, next) {
    return Erc20Contracts.find({contract_address: {$in: contractAddresses}}, function(err, row) {
        return next(err, row);
    });
};

/**
 *
 * @param {String} str
 * @param {Function} next
 * @return {*}
 */
Erc20ContractsRepository.prototype.findBySymbolOrContractAddress = function (str, next) {

    var where = {};
    where.$or = [{symbol : str}, {contract_address: str}];

    return Erc20Contracts.findOne(where, function(err, row) {
        return next(err, row);
    });
};

Erc20ContractsRepository.prototype.findBySymbol = function (symbol, next) {
    return Erc20Contracts.findOne({symbol: symbol}, function(err, row) {
        return next(err, row);
    });
};

Erc20ContractsRepository.prototype.fetchContract = function (contractAddress, next) {
    return Erc20Contracts.findOne({contract_address: contractAddress}, function(err, row) {
        return next(err, row);
    });
};
/**
 *
 * @param {String} txId
 * @param {Function} next
 * @return {*}
 */
Erc20ContractsRepository.prototype.fetchContractsByTxId = function (txId, next) {
    return Erc20Contracts.find({tx_hash: txId}, function(err, rows) {
        return next(err, rows);
    });
};

Erc20ContractsRepository.prototype.updateTotalSupply = function (contractAddress, totalSupply, next) {
    return Erc20Contracts.update({contract_address: contractAddress}, {total_supply: totalSupply}, function(err, row) {
        return next(err, row);
    });
};

Erc20ContractsRepository.prototype.createOrUpdateTx = function (data, next) {
    return Erc20Contracts.findOneAndUpdate({tx_hash: data.tx_hash, vout_idx: data.vout_idx}, data, {upsert: true, new: true}, function(err, row) {
        return next(err, row);
    });

};

module.exports = Erc20ContractsRepository;