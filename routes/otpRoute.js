const express = require("express");
const { OtpError, requestOTP, verifyOTP } = require("../services/otpGeneration");

const router = express.Router();

router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
});

router.post("/generate-otp", async (req, res) => {
    try {
        const { uuid, email, purpose } = req.body || {};
        const result = await requestOTP({ subjectId: uuid, email, purpose });
        return res.status(202).json({
            message: "If the address can receive email, a verification code has been sent.",
            requestId: result.requestId,
            maskedEmail: result.maskedEmail,
            expiresAt: result.expiresAt
        });
    } catch (err) {
        return sendOtpError(res, err, "Could not generate OTP");
    }
});

router.post("/verify-otp", async (req, res) => {
    try {
        const { requestId, otp } = req.body || {};
        const result = await verifyOTP({ requestId, otp });
        return res.status(200).json({
            message: "OTP verified successfully",
            verificationToken: result.verificationToken,
            expiresAt: result.expiresAt,
            subjectId: result.subjectId,
            purpose: result.purpose
        });
    } catch (err) {
        return sendOtpError(res, err, "Could not verify OTP");
    }
});

function sendOtpError(res, err, fallbackMessage) {
    if (err instanceof OtpError) {
        if (err.retryAfter) res.set("Retry-After", String(err.retryAfter));
        return res.status(err.status).json({ message: err.message, code: err.code });
    }

    console.error(`${fallbackMessage}:`, err);
    return res.status(500).json({ message: fallbackMessage, code: "OTP_INTERNAL_ERROR" });
}

module.exports = router;
