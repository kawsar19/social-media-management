// Business identity used across the public pages and the legal documents.
//
// ⚠️ THESE ARE PLACEHOLDERS. Replace every value below with real details before
// submitting the app for Meta / Google / LinkedIn review. Reviewers check that
// the operator named in a privacy policy is a real, contactable entity, and a
// policy carrying "[Your Company Name]" is a straightforward rejection.
//
// Everything lives here rather than inline in each page so there's exactly one
// place to edit — miss one and a legal page contradicts the others.
export const BUSINESS = {
  // The legal entity that operates the service.
  name: "[Your Company Name]",
  // The product name shown in the UI. Can differ from the legal entity.
  product: "Social Manager",
  // Where users reach you about their data. Meta requires a working address for
  // privacy and deletion requests, and it must be monitored.
  email: "[your@email.com]",
  // Registered business address. Required in most privacy regimes.
  address: "[Your Business Address]",
  // Public site URL, used for canonical links in the legal text.
  url: "[https://your-domain.com]",
  // The date the current legal text took effect. Update whenever the policies
  // change materially — users and reviewers both look for this.
  lastUpdated: "12 August 2026",
} as const;

// True when the placeholders above haven't been filled in yet. Used to show an
// on-page warning so an unedited policy can't be quietly submitted for review.
export const HAS_PLACEHOLDERS = Object.values(BUSINESS).some((v) =>
  v.startsWith("[")
);
