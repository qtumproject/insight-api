const mongoose = require('mongoose');

const erc20TransferSchema = new mongoose.Schema({
    tx_hash: {
        type: String,
        required: true
    },
    log_idx: {
        type: Number
    },
    contract_address: {
        type: String,
        required: true
    },
    from_eth: {
        type: String
    },
    to_eth: {
        type: String
    },
    from: {
        type: String
    },
    to: {
        type: String
    },
    value: {
        type: String
    }
}, {
    timestamps: {
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    }
});

const Erc20Transfer = mongoose.model('Erc20Transfer', erc20TransferSchema);

module.exports = Erc20Transfer;