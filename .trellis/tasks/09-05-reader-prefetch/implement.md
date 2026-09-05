# Implementation

- [x] Inspect current web/Android loading and available verification environments.
- [x] Implement bounded browser scheduling and lifecycle completion callbacks.
- [x] Implement Android layered prefetch and transfer reuse.
- [x] Add browser delayed-image coverage and Android controlled-service tests.
- [x] Run applicable local checks and review both implementations.
- [x] Update reader contracts and record executed/unavailable validation plus APK rebuild steps.
- [x] Push reader changes directly to main and complete GitHub Actions APK build #84, including all 78 JVM tests and device-test compilation.
- [x] Download the five release-signed APKs and verify every SHA-256 checksum.
- [ ] Run remote emulator/physical-device canvas tests and full APK smoke/performance checks; these remain explicitly unverified.
