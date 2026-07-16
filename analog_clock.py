import tkinter as tk
from tkinter import ttk
import math
import time
from datetime import datetime


class AnalogClock:
    def __init__(self, root):
        self.root = root
        self.root.title("Analog Clock")
        self.root.geometry("400x450")
        self.root.resizable(False, False)
        self.root.configure(bg="#1e1e2e")
        
        # Clock settings
        self.center_x = 200
        self.center_y = 200
        self.radius = 180
        
        # Create canvas
        self.canvas = tk.Canvas(
            root, 
            width=400, 
            height=400, 
            bg="#1e1e2e", 
            highlightthickness=0
        )
        self.canvas.pack(pady=20)
        
        # Digital time label
        self.time_label = tk.Label(
            root,
            text="",
            font=("Segoe UI", 24, "bold"),
            fg="#cdd6f4",
            bg="#1e1e2e"
        )
        self.time_label.pack(pady=10)
        
        # Draw static clock face
        self.draw_clock_face()
        
        # Start animation
        self.update_clock()
    
    def draw_clock_face(self):
        """Draw the static clock face (numbers, ticks, center)"""
        # Outer circle
        self.canvas.create_oval(
            self.center_x - self.radius,
            self.center_y - self.radius,
            self.center_x + self.radius,
            self.center_y + self.radius,
            outline="#89b4fa",
            width=3
        )
        
        # Inner circle
        self.canvas.create_oval(
            self.center_x - self.radius + 10,
            self.center_y - self.radius + 10,
            self.center_x + self.radius - 10,
            self.center_y + self.radius - 10,
            outline="#74c7ec",
            width=1
        )
        
        # Draw hour numbers and tick marks
        for i in range(1, 13):
            angle = math.radians(i * 30 - 90)  # -90 to start at 12 o'clock
            
            # Hour numbers
            num_x = self.center_x + (self.radius - 35) * math.cos(angle)
            num_y = self.center_y + (self.radius - 35) * math.sin(angle)
            self.canvas.create_text(
                num_x, num_y,
                text=str(i),
                font=("Segoe UI", 16, "bold"),
                fill="#cdd6f4"
            )
            
            # Major tick marks (hours)
            tick_start_x = self.center_x + (self.radius - 15) * math.cos(angle)
            tick_start_y = self.center_y + (self.radius - 15) * math.sin(angle)
            tick_end_x = self.center_x + (self.radius - 5) * math.cos(angle)
            tick_end_y = self.center_y + (self.radius - 5) * math.sin(angle)
            self.canvas.create_line(
                tick_start_x, tick_start_y,
                tick_end_x, tick_end_y,
                fill="#89b4fa",
                width=3
            )
        
        # Minor tick marks (minutes)
        for i in range(60):
            if i % 5 != 0:  # Skip hour positions
                angle = math.radians(i * 6 - 90)
                tick_start_x = self.center_x + (self.radius - 10) * math.cos(angle)
                tick_start_y = self.center_y + (self.radius - 10) * math.sin(angle)
                tick_end_x = self.center_x + (self.radius - 5) * math.cos(angle)
                tick_end_y = self.center_y + (self.radius - 5) * math.sin(angle)
                self.canvas.create_line(
                    tick_start_x, tick_start_y,
                    tick_end_x, tick_end_y,
                    fill="#585b70",
                    width=1
                )
        
        # Center dot
        self.canvas.create_oval(
            self.center_x - 8, self.center_y - 8,
            self.center_x + 8, self.center_y + 8,
            fill="#f38ba8",
            outline="#f38ba8"
        )
        
        # Center dot outer ring
        self.canvas.create_oval(
            self.center_x - 12, self.center_y - 12,
            self.center_x + 12, self.center_y + 12,
            outline="#f38ba8",
            width=2
        )
    
    def draw_hands(self, hour, minute, second):
        """Draw the clock hands"""
        # Clear previous hands (tagged as 'hands')
        self.canvas.delete("hands")
        
        # Hour hand
        hour_angle = math.radians((hour % 12) * 30 + minute * 0.5 - 90)
        hour_length = self.radius * 0.5
        hour_x = self.center_x + hour_length * math.cos(hour_angle)
        hour_y = self.center_y + hour_length * math.sin(hour_angle)
        self.canvas.create_line(
            self.center_x, self.center_y,
            hour_x, hour_y,
            fill="#f38ba8",
            width=6,
            capstyle=tk.ROUND,
            tags="hands"
        )
        
        # Minute hand
        minute_angle = math.radians(minute * 6 + second * 0.1 - 90)
        minute_length = self.radius * 0.75
        minute_x = self.center_x + minute_length * math.cos(minute_angle)
        minute_y = self.center_y + minute_length * math.sin(minute_angle)
        self.canvas.create_line(
            self.center_x, self.center_y,
            minute_x, minute_y,
            fill="#89b4fa",
            width=4,
            capstyle=tk.ROUND,
            tags="hands"
        )
        
        # Second hand
        second_angle = math.radians(second * 6 - 90)
        second_length = self.radius * 0.85
        second_x = self.center_x + second_length * math.cos(second_angle)
        second_y = self.center_y + second_length * math.sin(second_angle)
        self.canvas.create_line(
            self.center_x, self.center_y,
            second_x, second_y,
            fill="#a6e3a1",
            width=2,
            capstyle=tk.ROUND,
            tags="hands"
        )
        
        # Second hand counterweight
        counter_angle = math.radians(second * 6 + 90)
        counter_length = self.radius * 0.15
        counter_x = self.center_x + counter_length * math.cos(counter_angle)
        counter_y = self.center_y + counter_length * math.sin(counter_angle)
        self.canvas.create_line(
            self.center_x, self.center_y,
            counter_x, counter_y,
            fill="#a6e3a1",
            width=2,
            capstyle=tk.ROUND,
            tags="hands"
        )
        
        # Center cap over hands
        self.canvas.create_oval(
            self.center_x - 6, self.center_y - 6,
            self.center_x + 6, self.center_y + 6,
            fill="#f38ba8",
            outline="#f38ba8",
            tags="hands"
        )
    
    def update_clock(self):
        """Update the clock every 100ms for smooth second hand"""
        now = datetime.now()
        hour = now.hour
        minute = now.minute
        second = now.second
        microsecond = now.microsecond
        
        # Smooth second hand movement
        smooth_second = second + microsecond / 1_000_000
        
        # Draw hands
        self.draw_hands(hour, minute, smooth_second)
        
        # Update digital time
        time_str = now.strftime("%H:%M:%S")
        date_str = now.strftime("%A, %B %d, %Y")
        self.time_label.config(text=f"{time_str}\n{date_str}")
        
        # Schedule next update
        self.root.after(100, self.update_clock)


def main():
    root = tk.Tk()
    app = AnalogClock(root)
    root.mainloop()


if __name__ == "__main__":
    main()