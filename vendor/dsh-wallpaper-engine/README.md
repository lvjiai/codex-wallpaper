# 来源与适配

来源：li8476295-bot/dsh-plugin-wallpaper-engine，提交 2ae85c8a491ce179633a045c663b1b51ca5189c3，MIT 许可证见 LICENSE。

本副本沿用原项目的 Canvas 容器、cover 比例适配、DPR 分辨率、暗化遮罩、页面隐藏暂停和销毁逻辑。

适配仅增加：实时 Scene ImageBitmap 输入、显式 resize、独立导出名称、释放旧帧，以及 dim=0 的正确处理。Scene 的动画来自 Wallpaper Engine，不使用内置主题替代。

原参考仓库未修改。src/inject.mjs 在聊天主容器内调用此渲染器；不改整页、侧栏、输入控件的样式。
