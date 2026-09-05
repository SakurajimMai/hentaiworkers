# Design

Browser: separate admitted image elements from completed requests. Use a direction-aware finite page window and a bounded scheduler. Visible pages bypass speculative capacity. Keep one actual image URL/request path per page; load/error callbacks release speculative capacity independently of the initial image's decode/paint gate for ads. Refresh actual viewport geometry on scrolling and restore before accepting progress changes.

Browser verification refinements: neighbor positions map onto actual ordered page IDs, which can have gaps after admin deletion. Resolve local restoration before scheduling neighbors. A maximum 300 ms initial speculative grace protects the first transfer's bandwidth and ends early on initial network settlement; visible pages bypass it. A larger-image benchmark detected the need for this bounded grace even when `fetchPriority=low` was set on neighbors.

Android: use the shared Coil ImageLoader and URL disk keys. Prepare small adjacent memory previews and farther disk-only requests with explicit reader concurrency. Coordinate visible promotion with in-flight transfers instead of serializing visible display behind preview decode. Keep original/subsampling display and ad readiness intact. Inspect pinned Coil API before selecting a no-decode disk request.

Verification: browser harness using the real reader and controlled image responses; Android MockWebServer integration and deterministic policies. Report unavailable Android environment checks explicitly.
