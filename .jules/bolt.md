## 2024-07-09 - Reactivity missing in search components
**Learning:** The `SearchResults.vue` computed sliced results that were static, preventing updates.
**Action:** Always ensure dependent variables within setup block correctly use `computed()` if derived from props that change frequently.
