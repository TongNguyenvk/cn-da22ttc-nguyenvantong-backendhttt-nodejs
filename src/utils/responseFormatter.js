// Unified response formatter utilities used across controllers

function successResponse(res, status = 200, message = 'Thành công', data = null) {
	return res.status(status).json({
		success: true,
		message,
		data
	});
}

function errorResponse(res, status = 500, message = 'Lỗi server', error = null) {
	return res.status(status).json({
		success: false,
		message,
		error
	});
}

function notFoundResponse(res, message = 'Không tìm thấy') {
	return errorResponse(res, 404, message);
}

function validationErrorResponse(res, message = 'Dữ liệu không hợp lệ', details = null) {
	return errorResponse(res, 400, message, details);
}

// Generic error handler wrapper
function handleError(res, err, fallbackMessage = 'Lỗi server') {
	// Prefer explicit status code from known error shapes
	const status = (err && (err.status || err.statusCode)) || 500;
	const message = err && err.message ? err.message : fallbackMessage;
	// Optional stack only in non-production
	const payload = process.env.NODE_ENV === 'production'
		? undefined
		: err && err.stack;

	return errorResponse(res, status, message, payload);
}

module.exports = {
	successResponse,
	errorResponse,
	handleError,
	notFoundResponse,
	validationErrorResponse
};

