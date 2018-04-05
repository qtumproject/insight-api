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
TransactionService.prototype.getDetailedTransaction = function(txid, callback) {

    var self = this;
    var tx = null;
    return async.waterfall([function(callback) {

        return self.node.getDetailedTransaction(txid, function(err, transaction) {
            tx = transaction;
            return callback(err);
        });

    }, function(callback) {

        return self.addReceiptIfTransfersExists(tx, function(err, transaction) {
            return callback(err, transaction);
        });

    }], function(err, transaction) {
        return callback(err, transaction);
    });

};

/**
 *
 * @param {Object} transaction
 * @param {Function} next
 * @return {*}
 */
TransactionService.prototype.addReceiptIfTransfersExists = function(transaction, next) {

    var self = this;

    return async.waterfall([
        function(callback) {

            return self.erc20TransferRepository.isTransfersExistsByTxHash(transaction.hash, function(err, exists) {

                transaction.isqrc20Transfer = exists;

                return callback(err);
            });

        }, function(callback) {

            return self.node.getTransactionReceipt(transaction.hash, function(err, result) {

                if (err) {
                    return callback(err);
                }

                if (Array.isArray(result) && result.length) {
                    transaction.receipt = result;
                }

                return callback(null, transaction);
            });

        }], function(err, transaction) {
            return next(err, transaction);
        });
};


module.exports = TransactionService;