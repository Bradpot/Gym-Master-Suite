from django.db import models


class Member(models.Model):
    member_id = models.CharField(max_length=20, unique=True)
    full_name = models.CharField(max_length=255)
    phone_number = models.CharField(max_length=50)
    profile_photo_url = models.TextField(null=True, blank=True)
    payment_mode = models.CharField(max_length=30, default="cash")
    payment_received = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    membership_start_date = models.DateField()
    date_of_joining = models.DateField(null=True, blank=True)
    deposit_date = models.DateField(null=True, blank=True)
    membership_duration_days = models.PositiveIntegerField(null=True, blank=True)
    membership_duration_months = models.DecimalField(max_digits=4, decimal_places=1, default=1.0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]


class NotificationLog(models.Model):
    STATUS_SENT = "sent"
    STATUS_FAILED = "failed"
    STATUS_CHOICES = [
        (STATUS_SENT, "Sent"),
        (STATUS_FAILED, "Failed"),
    ]

    member = models.ForeignKey(Member, on_delete=models.CASCADE, related_name="notification_logs")
    member_name = models.CharField(max_length=255)
    phone_number = models.CharField(max_length=50)
    message = models.TextField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES)
    sent_at = models.DateTimeField()

    class Meta:
        ordering = ["-sent_at"]
