const Issue = require("../models/Issue");

/**
 * Find unresolved issues whose SLA deadline has passed
 * and mark them as escalated.
 */
async function checkSLAAndEscalate() {
  try {
    const now = new Date();

    const overdueIssues = await Issue.find({
      slaDeadline: { $lt: now },
      escalated: false,
      status: { $nin: ["resolved", "rejected"] },
    });

    console.log(
      `SLA Checker: ${overdueIssues.length} overdue issue(s) found.`
    );

    for (const issue of overdueIssues) {
      issue.escalated = true;
      issue.escalatedAt = now;

      await issue.save();

      console.log(
        `SLA ESCALATED → Issue ${issue._id}`
      );
    }

    return overdueIssues.length;
  } catch (error) {
    console.error(
      "SLA checker error:",
      error.message
    );

    return 0;
  }
}

module.exports = {
  checkSLAAndEscalate,
};