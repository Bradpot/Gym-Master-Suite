from django.core.management.base import BaseCommand

from api.views import send_expiry_notifications_whatsapp


class Command(BaseCommand):
    help = "Send WhatsApp renewal reminders to members with expiring memberships."

    def handle(self, *args, **options):
        result = send_expiry_notifications_whatsapp()
        self.stdout.write(
            self.style.SUCCESS(
                f"WhatsApp reminders processed | sent={result.get('sent', 0)} failed={result.get('failed', 0)}"
            )
        )
