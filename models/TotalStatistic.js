const mongoose = require('mongoose');

const TYPES = {
    posTotalAmount: 'posTotalAmount'
};

const totalStatisticSchema = new mongoose.Schema({
    type: {
        type: String,
        enum : Object.keys(TYPES),
        required: true
    },
    value: {
        type: String,
        required: true,
        default : '0'
    }
}, {
    timestamps: {
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    }
});

const TotalStatistic = mongoose.model('TotalStatistic', totalStatisticSchema);

TotalStatistic.TYPES = TYPES;

module.exports = TotalStatistic;