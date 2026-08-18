const express = require("express");
const router = express.Router();

const multer = require("multer");
const { storage } = require("../config/cloudinary");

const upload = multer({ storage });

const issueController = require("../controllers/issueController");

const { isLoggedIn } = require("../middleware/auth");


// ========================================
// ISSUE LIST
// Login required
// ========================================

router
  .route("/")
  .get(isLoggedIn, issueController.index)
  .post(
    isLoggedIn,
    upload.array("images", 3),
    issueController.createIssue
  );


// ========================================
// CREATE ISSUE FORM
// Login required
// ========================================

router.get(
  "/new",
  isLoggedIn,
  issueController.renderNewForm
);


// ========================================
// MY ISSUES
// Login required
// ========================================

router.get(
  "/my",
  isLoggedIn,
  issueController.myIssues
);


// ========================================
// SINGLE ISSUE
// Login required
// ========================================

router
  .route("/:id")
  .get(
    isLoggedIn,
    issueController.showIssue
  )
  .delete(
    isLoggedIn,
    issueController.deleteIssue
  );


// ========================================
// UPVOTE
// Login required
// ========================================

router.post(
  "/:id/upvote",
  isLoggedIn,
  issueController.upvoteIssue
);


// ========================================
// FEEDBACK
// Login required
// ========================================

router.post(
  "/:id/feedback",
  isLoggedIn,
  issueController.submitFeedback
);


module.exports = router;
