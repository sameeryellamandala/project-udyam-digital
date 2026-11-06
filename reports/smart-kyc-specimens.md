# Smart KYC specimen validation

All supplied images processed. Applicant grouping uses fixture names only; extraction and validation never use applicant IDs or filenames. Expected contact/business details use matching supplied lead/registry records where available. No judges-only answer key was provided. Registry matches do not prove authenticity.

{
  "documents": 47,
  "applicants": 12,
  "extracted": 44,
  "partiallyExtracted": 2,
  "failed": 1,
  "independentLeadMatches": 12,
  "outcomes": {
    "action_required": 12
  }
}

| Applicant | Overall result | Signals |
|---|---|---|
| K01 | action_required | registration_inactive, not_extracted |
| K02 | action_required | not_extracted, invalid_registration_format, registration_number_mismatch, udyam_date_mismatch |
| K03 | action_required | udyam_date_mismatch |
| K04 | action_required | extraction_failed, udyam_date_mismatch |
| K05 | action_required | invalid_registration_format, registration_number_mismatch, address_mismatch, name_mismatch |
| K06 | action_required | invalid_registration_format, registration_number_mismatch, udyam_activity_mismatch, udyam_date_mismatch |
| K07 | action_required | invalid_registration_format, registration_number_mismatch, udyam_date_mismatch |
| K08 | action_required | invalid_registration_format, registration_number_mismatch, udyam_date_mismatch |
| K09 | action_required | udyam_date_mismatch |
| K10 | action_required | invalid_checksum, registration_number_mismatch, udyam_activity_mismatch, udyam_date_mismatch, name_mismatch |
| K11 | action_required | udyam_activity_mismatch, udyam_date_mismatch, document_expired_or_outdated |
| K12 | action_required | udyam_activity_mismatch, udyam_date_mismatch |
