const Issue = require("../models/Issue");
const User = require("../models/User");
const Department = require("../models/Department");
const Notification = require("../models/Notification");
const { sendStatusUpdateEmail } = require("../utils/mailer");

module.exports.dashboard = async (req, res) => {
  const filter = {};
  // staff only see issues assigned to their department
  if (req.user.role === "staff" && req.user.department) {
    filter.assignedDept = req.user.department;
  }

  const issues = await Issue.find(filter)
    .populate("reportedBy", "username")
    .populate("assignedDept", "name")
    .populate("assignedStaff", "username")
    .sort({ priority: -1, createdAt: -1 });

  const stats = {
    total: issues.length,
    reported: issues.filter((i) => i.status === "reported").length,
    inProgress: issues.filter((i) => i.status === "in_progress").length,
    resolved: issues.filter((i) => i.status === "resolved").length,
    overdue: issues.filter(
      (i) => i.slaDeadline && new Date() > i.slaDeadline && i.status !== "resolved"
    ).length,
  };

  const staffList =
    req.user.role === "admin" ? await User.find({ role: "staff" }) : [];

  res.render("admin/dashboard", { issues, stats, staffList });
};

module.exports.updateStatus = async (req, res) => {
  const { status, note } = req.body;
  const issue = await Issue.findById(req.params.id).populate("reportedBy", "username email");

  if (!issue) {
    req.flash("error", "Issue not found");
    return res.redirect("/admin/dashboard");
  }

  // Require a proof photo before an issue can be marked resolved
  if (status === "resolved" && !req.file && !(issue.resolutionImage && issue.resolutionImage.url)) {
    req.flash("error", "Please upload a proof photo before marking this issue as resolved");
    return res.redirect(`/issues/${issue._id}`);
  }

  if (req.file) {
    issue.resolutionImage = { url: req.file.path, filename: req.file.filename };
  }

  issue.status = status;
  issue.statusHistory.push({
    status,
    updatedBy: req.user._id,
    note: note || "",
  });

  if (status === "resolved") {
    issue.resolvedAt = new Date();
  }

  await issue.save();

  try {
    await Notification.create({
      user: issue.reportedBy._id,
      issue: issue._id,
      message: `Your report "${issue.title}" is now ${status.replace("_", " ")}`,
    });
  } catch (err) {
    console.error("Failed to create in-app notification:", err.message);
  }

  sendStatusUpdateEmail({
    toEmail: issue.reportedBy.email,
    toName: issue.reportedBy.username,
    issueTitle: issue.title,
    issueId: issue._id,
    newStatus: status,
    note,
  });

  req.flash("success", "Issue status updated");
  res.redirect(`/issues/${issue._id}`);
};

module.exports.assignStaff = async (req, res) => {
  const { staffId } = req.body;
  const issue = await Issue.findById(req.params.id);

  if (!issue) {
    req.flash("error", "Issue not found");
    return res.redirect("/admin/dashboard");
  }

  issue.assignedStaff = staffId;
  if (issue.status === "reported") {
    issue.status = "acknowledged";
    issue.statusHistory.push({
      status: "acknowledged",
      updatedBy: req.user._id,
      note: "Assigned to staff",
    });
  }

  await issue.save();
  req.flash("success", "Staff assigned successfully");
  res.redirect("/admin/dashboard");
};

module.exports.renderCreateStaffForm = async (req, res) => {
  const departments = await Department.find().sort({ name: 1 });
  res.render("admin/create-staff", { departments });
};

module.exports.createStaff = async (req, res) => {
  try {
    const { username, email, password, department, phone } = req.body;

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      req.flash("error", "Username or email already registered");
      return res.redirect("/admin/staff/new");
    }

    const staff = new User({
      username,
      email,
      password,
      phone: phone || "",
      role: "staff",
      department: department || null,
    });

    await staff.save();

    req.flash("success", `Staff account created for ${staff.username}`);
    res.redirect("/admin/dashboard");
  } catch (err) {
    console.error(err);
    req.flash("error", "Something went wrong while creating the staff account");
    res.redirect("/admin/staff/new");
  }
};

module.exports.analytics = async (req, res) => {
  const byCategory = await Issue.aggregate([
    { $group: { _id: "$category", count: { $sum: 1 } } },
  ]);

  const byStatus = await Issue.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  const avgResolutionTime = await Issue.aggregate([
    { $match: { status: "resolved", resolvedAt: { $ne: null } } },
    {
      $project: {
        resolutionHours: {
          $divide: [
            { $subtract: ["$resolvedAt", "$createdAt"] },
            1000 * 60 * 60,
          ],
        },
      },
    },
    { $group: { _id: null, avgHours: { $avg: "$resolutionHours" } } },
  ]);

  res.render("admin/analytics", {
    byCategory,
    byStatus,
    avgResolutionHours: avgResolutionTime[0]?.avgHours || 0,
  });
};
