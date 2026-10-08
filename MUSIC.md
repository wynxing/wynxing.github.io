# 音乐曲目与许可

首页播放器使用的六首曲子都是纯音乐，许可为 [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)（公共领域贡献）。CC0 允许复制、修改和公开播放，不要求署名。下面仍列出作者与来源，方便核对。

每首曲子的许可以 OpenGameArt 曲目页上的 License 字段为准，核对日期为 2026-10-08。页面上的许可名称是 CC0，并链接到上面的 CC0 1.0 文本。音频放在 `public/music/`，构建后从站点根路径提供。为控制仓库体积，文件用 LAME 重新编码为 MP3：立体声 128 kbps，`Lofi Again` 的源文件是单声道，因此保持单声道 96 kbps。没有剪辑、变速或混入其他声音。

| 曲目 | 作者 | 文件 | 来源页面 | 许可 |
| --- | --- | --- | --- | --- |
| First Light Particles | Yoiyami | `public/music/first-light-particles.mp3` | [First Light Particles](https://opengameart.org/content/first-light-particles-%E2%80%93-cc0-atmospheric-pianoambient-track) | CC0 1.0 |
| Chill Lofi | omfgdude | `public/music/chill-lofi.mp3` | [Chill lofi inspired](https://opengameart.org/content/chill-lofi-inspired) | CC0 1.0 |
| Vaporware | The Cynic Project | `public/music/vaporware.mp3` | [Calm Piano 1 (Vaporware)](https://opengameart.org/content/calm-piano-1-vaporware) | CC0 1.0 |
| Lofi Again | omfgdude | `public/music/lofi-again.mp3` | [Lofi again](https://opengameart.org/content/lofi-again) | CC0 1.0 |
| Yoiyami Core Theme | Yoiyami | `public/music/yoiyami-core-theme.mp3` | [Yoiyami Core Theme](https://opengameart.org/content/yoiyami-core-theme-%E2%80%93-deep-blue-ambient-piano) | CC0 1.0 |
| Calm Track | pmiller | `public/music/calm-track.mp3` | [Calm Track](https://opengameart.org/content/calm-track) | CC0 1.0 |

来源页对这几首的说明都是器乐：钢琴、环境音、lo-fi 伴奏，没有人声歌词。`Vaporware` 在 OpenGameArt 上的作者名是 cynicmusic，曲目页请人署名为 The Cynic Project / cynicmusic.com / pixelsphere.org。CC0 不强制署名，播放器仍显示这个名字。

更换曲目时改 `src/data/music.ts`，把音频放进 `public/music/`，并在这里补上作者、来源页面和许可。许可说不清的不要放进来。
