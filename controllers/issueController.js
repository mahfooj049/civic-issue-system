const Issue = require("../models/Issue");
const Department = require("../models/Department");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { findNearbyDuplicates } = require("../utils/duplicateDetection");
const { classifyImage } = require("../utils/imageClassifier");

// GET all issues (map + list view)
module.exports.index = async (req, res) => {
  const { category, status } = req.query;
  const filter = {};
  if (category) filter.category = category;
  if (status) filter.status = status;

  const issues = await Issue.find(filter)
    .populate("reportedBy", "username")
    .sort({ createdAt: -1 });

  res.render("issues/index", { issues, category, status });
};

// GET new issue form
module.exports.renderNewForm = (req, res) => {
  res.render("issues/new");
};

// POST create new issue
module.exports.createIssue = async (req, res) => {
  try {
    const { title, description, category, lat, lng, address } = req.body;

    if (!lat || !lng) {
      req.flash("error", "Please select a location on the map");
      return res.redirect("/issues/new");
    }

    const images = req.files
      ? req.files.map((f) => ({ url: f.path, filename: f.filename }))
      : [];

    const newIssue = new Issue({
      title,
      description,
      category,
      images,
      location: {
        type: "Point",
        coordinates: [parseFloat(lng), parseFloat(lat)],
      },
      address,
      reportedBy: req.user._id,
      statusHistory: [
        { status: "reported", updatedBy: req.user._id, note: "Issue reported" },
      ],
    });

    // AI: try image classification (non-blocking - if it fails, continue without it)
    if (images.length > 0) {
      try {
        const aiResult = await classifyImage(images[0].url);
        if (aiResult) {
          newIssue.aiSuggestedCategory = aiResult.category;
          newIssue.aiConfidence = aiResult.confidence;
        }
      } catch (err) {
        console.log("AI classification skipped:", err.message);
      }
    }

    // Duplicate detection: check nearby issues (within 50m) of same category
    const duplicates = await findNearbyDuplicates(
      parseFloat(lng),
      parseFloat(lat),
      category
    );

    if (duplicates.length > 0) {
      newIssue.isDuplicate = true;
      newIssue.duplicateOf = duplicates[0]._id;
      // auto-upvote the original issue instead of creating noise
      if (!duplicates[0].upvotes.includes(req.user._id)) {
        duplicates[0].upvotes.push(req.user._id);
        duplicates[0].priority = calculatePriority(duplicates[0]);
        await duplicates[0].save();
      }
      req.flash(
        "success",
        "Similar issue already reported nearby! We've added your upvote to it instead."
      );
      await newIssue.save(); // still saved for record-keeping, but marked duplicate
      return res.redirect(`/issues/${duplicates[0]._id}`);
    }

    // Auto-assign department based on category
    const dept = await Department.findOne({ categories: category });
    if (dept) {
      newIssue.assignedDept = dept._id;
      const slaHours = dept.slaHours || 72;
      newIssue.slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000);
    }
    newIssue.priority = calculatePriority(newIssue);

    await newIssue.save();

    // Notify department staff about the new issue (non-blocking)
    if (newIssue.assignedDept) {
      try {
        const deptStaff = await User.find({
          role: "staff",
          department: newIssue.assignedDept,
        });
        if (deptStaff.length > 0) {
          await Notification.insertMany(
            deptStaff.map((s) => ({
              user: s._id,
              issue: newIssue._id,
              message: `New issue reported in your department: "${newIssue.title}"`,
            }))
          );
        }
      } catch (err) {
        console.error("Failed to notify department staff:", err.message);
      }
    }

    req.flash("success", "Issue reported successfully!");
    res.redirect(`/issues/${newIssue._id}`);
  } catch (err) {
    console.error(err);
    req.flash("error", "Something went wrong while reporting the issue");
    res.redirect("/issues/new");
  }
};

// GET single issue detail
module.exports.showIssue = async (req, res) => {
  const issue = await Issue.findById(req.params.id)
    .populate("reportedBy", "username email")
    .populate("assignedDept", "name")
    .populate("assignedStaff", "username")
    .populate("statusHistory.updatedBy", "username");

  if (!issue) {
    req.flash("error", "Issue not found");
    return res.redirect("/issues");
  }

  res.render("issues/show", { issue });
};

// POST upvote an issue
module.exports.upvoteIssue = async (req, res) => {
  const issue = await Issue.findById(req.params.id);
  if (!issue) {
    req.flash("error", "Issue not found");
    return res.redirect("/issues");
  }

  const alreadyUpvoted = issue.upvotes.includes(req.user._id);
  if (alreadyUpvoted) {
    issue.upvotes.pull(req.user._id);
  } else {
    issue.upvotes.push(req.user._id);
  }

  issue.priority = calculatePriority(issue);
  await issue.save();

  res.redirect(`/issues/${issue._id}`);
};

// DELETE issue (only by reporter or admin)
module.exports.deleteIssue = async (req, res) => {
  const issue = await Issue.findById(req.params.id);
  if (!issue) {
    req.flash("error", "Issue not found");
    return res.redirect("/issues");
  }

  const isOwner = issue.reportedBy.equals(req.user._id);
  const isAdmin = req.user.role === "admin";

  if (!isOwner && !isAdmin) {
    req.flash("error", "You don't have permission to delete this issue");
    return res.redirect(`/issues/${issue._id}`);
  }

  await Issue.findByIdAndDelete(req.params.id);
  req.flash("success", "Issue deleted");
  res.redirect("/issues");
};

// Priority scoring: based on upvotes + category severity
function calculatePriority(issue) {
  const upvoteCount = issue.upvotes.length;
  const severeCategories = ["water_leakage", "electricity", "road_damage"];
  let base = severeCategories.includes(issue.category) ? 2 : 1;

  if (upvoteCount >= 10) base += 2;
  else if (upvoteCount >= 5) base += 1;

  return Math.min(base, 3); // cap at 3 (high)
}

// GET logged-in user's complaints
module.exports.myIssues = async (req, res) => {
  try {
    const issues = await Issue.find({
      reportedBy: req.user._id,
    })
      .populate("assignedDept", "name")
      .populate("assignedStaff", "username")
      .sort({ createdAt: -1 });

    res.render("issues/my", { issues });
  } catch (err) {
    console.error(err);
    req.flash("error", "Unable to load your complaints");
    res.redirect("/issues");
  }
};

// POST feedback for a resolved issue
module.exports.submitFeedback = async (req, res) => {
  try {
    const { rating, comment } = req.body;

    const issue = await Issue.findById(req.params.id);

    if (!issue) {
      req.flash("error", "Issue not found");
      return res.redirect("/issues");
    }

    // Only the person who reported the issue can give feedback
    if (!issue.reportedBy.equals(req.user._id)) {
      req.flash("error", "You can only give feedback for your own complaint");
      return res.redirect(`/issues/${issue._id}`);
    }

    // Feedback only after resolution
    if (issue.status !== "resolved") {
      req.flash(
        "error",
        "You can give feedback only after the issue is resolved"
      );

      return res.redirect(`/issues/${issue._id}`);
    }

    // Prevent multiple feedback submissions
    if (issue.feedback && issue.feedback.submittedAt) {
      req.flash("error", "Feedback has already been submitted");
      return res.redirect(`/issues/${issue._id}`);
    }

    issue.feedback = {
      rating: Number(rating),
      comment: comment || "",
      submittedAt: new Date(),
    };

    await issue.save();

    req.flash("success", "Thank you for your feedback!");

    res.redirect(`/issues/${issue._id}`);

  } catch (err) {
    console.error(err);

    req.flash("error", "Unable to submit feedback");

    res.redirect(`/issues/${req.params.id}`);
  }
};

module.exports.calculatePriority = calculatePriority;
