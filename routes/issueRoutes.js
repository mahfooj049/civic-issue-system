const express = require("express");
const router = express.Router();
const multer = require("multer");
const { storage } = require("../config/cloudinary");
const upload = multer({ storage });

const issueController = require("../controllers/issueController");
const { isLoggedIn } = require("../middleware/auth");

router
  .route("/")
  .get(issueController.index)
  .post(isLoggedIn, upload.array("images", 3), issueController.createIssue);

router.get("/new", isLoggedIn, issueController.renderNewForm);

router.get("/my", isLoggedIn, issueController.myIssues);

router
  .route("/:id")
  .get(issueController.showIssue)
  .delete(isLoggedIn, issueController.deleteIssue);

router.post("/:id/upvote", isLoggedIn, issueController.upvoteIssue);

router.post(
  "/:id/feedback",
  isLoggedIn,
  issueController.submitFeedback
);

module.exports = router;
