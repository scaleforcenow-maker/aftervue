resource "google_firestore_database" "default" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.firestore_location
  type        = "FIRESTORE_NATIVE"

  # Lead records are the business's book of record; never let a plan delete them.
  delete_protection_state = "DELETE_PROTECTION_ENABLED"
  deletion_policy         = "ABANDON"

  point_in_time_recovery_enablement = "POINT_IN_TIME_RECOVERY_ENABLED"
  app_engine_integration_mode       = "DISABLED"

  depends_on = [google_project_service.apis]
}
