# Quick Start Guide for Feyenoord News Dashboard on Raspberry Pi

This guide will help you set up the Feyenoord News Dashboard on a Raspberry Pi.

## Prerequisites

- Raspberry Pi with Raspberry Pi OS installed.
- Internet connection.
- Basic knowledge of terminal and shell scripting.

1. **Install Docker on Raspberry Pi**

    To run the dashboard, Docker must be installed on your Raspberry Pi. Use these commands to install Docker:

    1. Download the Docker installation script:
    curl -fsSL https://get.docker.com -o get-docker.sh
    2. Execute the script to install Docker:
    sudo sh get-docker.sh
    3. Add your user to the Docker group to allow running Docker commands without sudo:
    sudo usermod -aG docker $(whoami)
    Note: You might need to log out and log back in for the group change to take effect.

2. **Prevent Raspberry Pi from Falling Asleep**

    To keep the display awake and disable screen blanking, add these lines to /etc/xdg/lxsession/LXDE-pi/autostart:

    @xset s noblank
    @xset s off
    @xset -dpms

3. **Install Chromium Browser**

    Ensure Chromium Browser is installed for displaying the dashboard in kiosk mode:

    sudo apt-get update
    sudo apt-get install chromium-browser -y


## Installation

1. **Prepare the Scripts**

    First, you need to download or create two scripts: `pull_project.sh` and `start_dashboard.sh`.

    The `pull_project.sh` script will clone the repository, build the Docker image, and run the container. Here's the script:

    ```bash
    #!/bin/bash

    # Define the repository location
    REPO_DIR=~/Feyenoord-News-Dashboard

    # Check if the repository directory already exists
    if [ -d "$REPO_DIR" ]; then
        echo "Repository directory exists. Pulling latest changes..."
        cd "$REPO_DIR"
        git pull
    else
        echo "Repository directory does not exist. Cloning repository..."
        git clone https://github.com/owen282000/Feyenoord-News-Dashboard.git "$REPO_DIR"
        cd "$REPO_DIR"
    fi

    # Build the Docker image
    docker build . -t feyenoord-news-display

    # Stop and remove the existing container if it exists
    docker stop fnd 2>/dev/null || true
    docker rm fnd 2>/dev/null || true

    # Run the Docker container
    docker run -p 80:3000 --name fnd -e WEATHER_API_KEY=****************** -d feyenoord-news-display:latest
    ```

    The `start_dashboard.sh` script will start the container and launch Chromium in kiosk mode to display the dashboard:

    ```bash
    #!/bin/bash

    # Pull project and start container
    /home/$(whoami)/pull_project.sh

    # Wait for the Docker container to be fully up and running
    until $(curl --output /dev/null --silent --head --fail http://localhost:80); do
        printf '.'
        sleep 5
    done

    # Now that the container is up, start Chromium in kiosk mode
    /usr/bin/chromium-browser --noerrdialogs --kiosk http://localhost --disable-translate --no-first-run --fast --fast-start --disable-infobars --disable-features=TranslateUI &
    ```

2. **Make Scripts Executable**

    Copy these scripts to your home directory and make them executable:

    ```bash
    chmod +x ~/pull_project.sh ~/start_dashboard.sh
    ```

3. **Add to Cron**

    To ensure these scripts run at boot, add them to your crontab:

    ```bash
    crontab -e
    ```

    Add the following line to run the start script at reboot:

    ```
    @reboot /bin/bash /home/$(whoami)/start_dashboard.sh
    ```

4. **Running the Dashboard**

    Reboot your Raspberry Pi. The `start_dashboard.sh` script will execute at boot, pulling the latest project changes, starting the Docker container, and opening the dashboard in Chromium.

## Additional Notes

- Ensure your Raspberry Pi has a stable internet connection for the repository to pull.
- Adjust the `WEATHER_API_KEY` in the `pull_project.sh` script with your actual API key.
