#!/bin/bash
# Valheim Installation Script
#
# Server Files: /mnt/server
# Image to install with is 'debian:buster-slim'
apt -y update
apt -y --no-install-recommends --no-install-suggests install wget

## just in case someone removed the defaults.
if [ "${STEAM_USER}" == "" ]; then
    echo -e "steam user is not set.\n"
    echo -e "Using anonymous user.\n"
    # ------------------------------
    # Steam user defaults
    # ------------------------------
    : "${STEAM_USER:=anonymous}"
    : "${STEAM_PASS:=}"
    : "${STEAM_AUTH:=}"
else
    echo -e "user set to ${STEAM_USER}"
fi

## download and install steamcmd
cd /tmp
mkdir -p /mnt/server/steamcmd
curl -sSL -o steamcmd.tar.gz https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz
tar -xzvf steamcmd.tar.gz -C /mnt/server/steamcmd
cd /mnt/server/steamcmd

# SteamCMD fails otherwise for some reason, even running as root.
# This is changed at the end of the install process anyways.
chown -R root:root /mnt
export HOME=/mnt/server

## install game using steamcmd
./steamcmd.sh +force_install_dir /mnt/server +login ${STEAM_USER} ${STEAM_PASS} ${STEAM_AUTH} +app_update ${SRCDS_APPID} ${EXTRA_FLAGS} +quit

## set up 32 bit libraries
mkdir -p /mnt/server/.steam/sdk32
cp -v linux32/steamclient.so ../.steam/sdk32/steamclient.so

## set up 64 bit libraries
mkdir -p /mnt/server/.steam/sdk64
cp -v linux64/steamclient.so ../.steam/sdk64/steamclient.so

echo "-------------------------------------------------------"
echo "installing BepInEx..."
echo "-------------------------------------------------------"
if ! api_response=$(curl -sfSL -H "accept: application/json" "$BEPINEX_URL"); then
        fatal "Error: could not retrieve BepInEx release info from Thunderstore.io API"
fi

download_url=$(jq -r  ".latest.download_url" <<< "$api_response" )
version_number=$(jq -r  ".latest.version_number" <<< "$api_response" )


cd /mnt/server
#echo $download_url
wget --content-disposition $download_url
unzip -o denikson-BepInExPack_Valheim-${version_number}.zip
cp -r /mnt/server/BepInExPack_Valheim/* /mnt/server


##cleanup
echo "-------------------------------------------------------"
echo "cleanup files..."
echo "-------------------------------------------------------"
rm -fR BepInExPack_Valheim
rm -fR icon.png
rm -fR denikson-BepInExPack_Valheim-*
rm -fR manifest.json
rm -fR README.m

#rm -fR start_*

echo "-------------------------------------------------------"
echo "Installation completed"
echo "-------------------------------------------------------"