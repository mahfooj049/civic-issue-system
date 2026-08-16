const Issue = require("../models/Issue");

/**
 * Finds existing (non-duplicate, unresolved) issues within `radiusMeters`
 * of the given coordinates, matching the same category.
 * This is our "duplicate detection" - geo-proximity + same category.
 */
async function findNearbyDuplicates(lng, lat, category, radiusMeters = 50) {
  const nearbyIssues = await Issue.find({
    category,
    isDuplicate: false,
    status: { $nin: ["resolved", "rejected"] },
    location: {
      $near: {
        $geometry: { type: "Point", coordinates: [lng, lat] },
        $maxDistance: radiusMeters,
      },
    },
  }).limit(5);

  return nearbyIssues;
}

module.exports = { findNearbyDuplicates };
