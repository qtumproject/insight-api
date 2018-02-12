const mongoose = require('mongoose');

const addressBlocksMinedSchema = new mongoose.Schema({
    address: {
        type: String,
        required: true,
        index: true
    },
    count: {
        type: Number,
        required: true
    }
}, {
    timestamps: {
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    }
});

const AddressBlocksMined = mongoose.model('AddressBlocksMined', addressBlocksMinedSchema);

module.exports = AddressBlocksMined;