
function ResponseError(message, code) {
    this.message = message;
    this.code = code;
}

module.exports = ResponseError;