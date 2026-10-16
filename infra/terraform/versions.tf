terraform {
  required_version = ">= 1.6.0"

  required_providers {
    google = {
      source = "hashicorp/google"
      # Pinned. Bump deliberately and re-run `terraform plan`; the Cloud Run v2,
      # Firestore and Monitoring schemas have changed across major versions.
      version = "8.6.0"
    }
  }
}
