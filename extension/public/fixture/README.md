# Synthetic Chrome review fixture

This page contains no student data and makes no network request. It exists so a
fresh Chrome Extension install can be checked without a real grading account.

From the repository root, serve `extension/public` and open the printed URL:

```bash
python scripts/release/serve_chrome_fixture.py
```

Then open `/fixture/synthetic-grading.html`, grant the extension's data consent,
and run `开发者模式 → 健康检查` followed by `试运行写分` or `试运行提交` with
the dry-run buttons. A successful synthetic submit only updates the local page.
