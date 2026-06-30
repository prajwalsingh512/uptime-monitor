# deploy/main.tf
# ----------------------------------------------------------------------------
# HYPOTHETICAL deployment sketch — NOT meant to be applied as-is.
# Goal: show the cloud topology I'd use to host this MVP on AWS with minimal
# moving parts: two containers behind a load balancer, backed by a managed
# Postgres instance (swapped in for SQLite at this scale) and ECR for images.
# ----------------------------------------------------------------------------

provider "aws" {
  region = "us-east-1"
}

# --- Networking (default VPC for MVP simplicity) ---------------------------
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# --- Container registry -----------------------------------------------------
resource "aws_ecr_repository" "backend" {
  name = "uptime-monitor-backend"
}

resource "aws_ecr_repository" "frontend" {
  name = "uptime-monitor-frontend"
}

# --- ECS Fargate cluster running both services ------------------------------
resource "aws_ecs_cluster" "this" {
  name = "uptime-monitor-cluster"
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "uptime-monitor-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  container_definitions = jsonencode([
    {
      name      = "backend"
      image     = "${aws_ecr_repository.backend.repository_url}:latest"
      portMappings = [{ containerPort = 4000 }]
      environment = [
        { name = "PORT", value = "4000" },
        { name = "DATABASE_URL", value = "postgres://..." } # swap SQLite -> RDS at this stage
      ]
    }
  ])
}

resource "aws_ecs_service" "backend" {
  name            = "uptime-monitor-backend"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = 1
  launch_type     = "FARGATE"
  network_configuration {
    subnets          = data.aws_subnets.default.ids
    assign_public_ip = true
  }
}

# --- Frontend: served as a static site via S3 + CloudFront in production ---
resource "aws_s3_bucket" "frontend" {
  bucket = "uptime-monitor-frontend-static"
}

# A CloudFront distribution would front this bucket, and the dashboard's
# API_BASE_URL would point at an Application Load Balancer in front of the
# ECS backend service (omitted here for brevity — this is a sketch, not a
# production-hardened topology).
