const mongoose = require('mongoose');

const erc20ContractsSchema = new mongoose.Schema({
    block_height: {
        type: Number
    },
    tx_hash: {
        type: String,
        required: true
    },
    vout_idx: {
        type: Number,
        required: true
    },
    contract_address_base: {
        type: String,
        required: true
    },
    contract_address: {
        type: String,
        required: true
    },
    symbol: {
        type: String
    },
    decimals: {
        type: String
    },
    name: {
        type: String
    },
    version: {
        type: String
    },
    total_supply: {
        type: String
    },
    exception: {
        type: Boolean
    },
    description: {
        type: String,
        required: false
    }
}, {
    timestamps: {
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    }
});

const Erc20Contracts = mongoose.model('Erc20Contracts', erc20ContractsSchema);

module.exports = Erc20Contracts;