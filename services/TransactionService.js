var async = require('async');

/**
 *
 * @param {Object} opts
 * @param {Object} opts.node
 * @param {Object} opts.erc20TransferRepository
 * @constructor
 */
function TransactionService(opts) {
    this.node = opts.node;
    this.erc20TransferRepository = opts.erc20TransferRepository;
}

/**
 *
 * @param {String} txid
 * @param {Function} callback
 * @return {*}
 */
TransactionService.prototype.getDetailedTransaction = function (txid, callback) {

    var self = this;
    var tx = null;
    return async.waterfall([function (callback) {

        return self.node.getDetailedTransaction(txid, function(err, transaction) {
            tx = transaction;
            return callback(err);
        });

    }, function (callback) {
        return self.erc20TransferRepository.getCountTransfersByTxHash(txid, function (err, count) {
            return callback(err, count);
        });
    }, function (count, callback) {

        if (count) {
            return self.node.getTransactionReceipt(txid, function (err, result) {

                if (err) {
                    return callback(err);
                }

                tx.receipt = result;

                return callback(null, tx);
            });
        }

        return callback(null, tx);
    }], function (err, tx) {
        return callback(err, tx);
    });

};


module.exports = TransactionService;