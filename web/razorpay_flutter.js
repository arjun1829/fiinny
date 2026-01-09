// web/razorpay_flutter.js

// This function will be called from Dart/Flutter
function openRazorpayWeb(optionsJson, successCallback, failureCallback) {
    try {
        const options = JSON.parse(optionsJson);

        // Define the handler for success
        options.handler = function (response) {
            console.log("Razorpay Success:", response);
            successCallback(
                response.razorpay_payment_id || "",
                response.razorpay_order_id || "",
                response.razorpay_signature || ""
            );
        };

        // Define modal dismissal (pseudo-cancellation)
        options.modal = {
            ondismiss: function () {
                console.log("Razorpay Dismissed");
                failureCallback("CANCELLED", "User cancelled payment");
            }
        };

        // Initialize Razorpay
        const rzp = new Razorpay(options);

        // Define failure event
        rzp.on('payment.failed', function (response) {
            console.error("Razorpay Failed:", response.error);
            failureCallback(
                response.error.code || "UNKNOWN",
                response.error.description || "Payment failed"
            );
        });

        rzp.open();
    } catch (e) {
        console.error("Razorpay Init Error:", e);
        failureCallback("INIT_ERROR", e.toString());
    }
}
