# Single Question Spec Template

Use this as a starting point for subjective math or science questions. Keep the sum of criteria scores equal to `maxScore`.

```markdown
---
id: qXX
subject: 数学
type: single
content: 第XX题（N分）
answer: |
  写入官方参考解。参考解用于说明一种标准路径，不是唯一可得分路径。

maxScore: N
criteria:
  - step: 能力点1：识别或推出关键关系
    score: A
    desc: >
      只要答卷中出现能支持该关系的有效证据，即给A分；不要求与参考解同序或同写法。
      若该关系未单独成行，但后续正确使用，可视为已获得。若关系本身错误且后续依赖该错误，
      本项0分。

  - step: 能力点2：得到关键结论
    score: B
    desc: >
      得到标准结论或数学等价结论给B分。若没有写中间式但直接得到正确结论，给满本项。
      若只得到中间正确表达但最终结论未写出，按本项说明固定给X分。

  - step: 能力点3：建立后续数量关系或方程
    score: C
    desc: >
      正确建立可用于后续求解的关系给C分。若关系未单列但在后续代入或计算中正确体现，
      给C分。若只写出部分条件，固定给Y分。

  - step: 能力点4：求出关键中间量
    score: D
    desc: >
      正确求出关键中间量或等价量给D分。列出正确方程但未解出，固定给1分。
      若最终结果正确且必须依赖该中间量，可反向认定本项得分。

  - step: 能力点5：得到最终结果
    score: E
    desc: >
      使用正确公式或等价方法并得到正确最终结果给E分。公式/方法正确但只发生计算错误，
      固定保留公式分Z分。若只写正确最终答案但无过程，只给结果保底分R分，不给无法验证的过程分。

ignore_rules:
  - 允许使用与参考答案不同但数学上等价的推导路径。
  - 不要求中间结论独立成行；后续正确使用可作为前序结论的有效证据。
  - 最终结果、关键中间量、公式写成等价形式均判正确。
  - 不因同一个错误重复扣分；若后续步骤只是沿用同一错误，按相关能力点分别判断是否仍有独立有效证据。
  - 对 OCR 不确定、字迹遮挡、关键表达无法辨认的样本，降低置信度并进入人工复核，不要自动提交。
review_rules:
  - 若总分落在高风险分段，或理由中出现“无法判断”“疑似”“看不清”，建议人工复核。
  - 若最终答案正确但过程识别缺失，必须重新检查是否应触发反向证据给分。
  - 若扣分集中发生在连续后续评分点，必须检查是否是一个前序结论未被识别导致的链式扣分。
---

这是第XX题的主观题评分 spec，供 CLI `validate-spec` 和 `start` 命令使用。
```

If validation rejects `review_rules`, move those rules into `ignore_rules` or the Markdown body.
