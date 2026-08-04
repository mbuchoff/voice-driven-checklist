terraform {
  required_version = "~> 1.12.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.55.0"
    }
  }

  backend "s3" {}
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = merge(
      {
        Application = "Voice Checklist"
        Environment = var.environment
        ManagedBy   = "OpenTofu"
      },
      var.tags,
    )
  }
}
