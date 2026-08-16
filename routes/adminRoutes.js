const express = require("express");
const router = express.Router();
const multer = require("multer");
const { storage } = require("../config/cloudinary");
const upload = multer({ storage });

const adminController = require("../controllers/adminController");
const { isLoggedIn } = require("../middleware/auth");
const roleCheck = require("../middleware/roleCheck");

router.get(
  "/dashboard",
  isLoggedIn,
  roleCheck("admin", "staff"),
  adminController.dashboard
);

router.post(
  "/issues/:id/status",
  isLoggedIn,
  roleCheck("admin", "staff"),
  upload.single("proofImage"),
  adminController.updateStatus
);

router.post(
  "/issues/:id/assign",
  isLoggedIn,
  roleCheck("admin"),
  adminController.assignStaff
);

router.get(
  "/staff/new",
  isLoggedIn,
  roleCheck("admin"),
  adminController.renderCreateStaffForm
);

router.post(
  "/staff",
  isLoggedIn,
  roleCheck("admin"),
  adminController.createStaff
);

router.get(
  "/analytics",
  isLoggedIn,
  roleCheck("admin"),
  adminController.analytics
);

module.exports = router;
