# Native CI image

This context builds the shared Ubuntu toolchain used by tworld's Qt5, Qt6, and
SDL1 native jobs. The base image is pinned by OCI digest and the publishing
workflow reports the resulting GHCR digest. Consumers must use that immutable
reference rather than either mutable tag.

The image deliberately contains both Qt generations. A Qt5 build must pass
`-DCMAKE_DISABLE_FIND_PACKAGE_Qt6=TRUE`; otherwise CMake will find Qt6 first.

The first publication is bootstrapped by merging these files to `master`. Read
the `Publish CI Image` run summary (or its `ci-image-reference` artifact) for
the digest to pin in downstream workflows.
