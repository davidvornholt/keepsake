{ pkgs }:
{
  # What keepsake runs, at the versions the package wraps.
  packages = [
    pkgs.exiftool
    pkgs.imagemagick
  ];
}
