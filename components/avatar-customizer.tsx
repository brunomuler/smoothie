"use client"

import * as React from "react"
import emojilib from "emojilib"
import { Search, Eraser } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { AVATAR_GRADIENTS, type AvatarCustomization, type GradientId } from "@/hooks/use-wallet-avatar-customization"

// Popular emojis for wallet avatars
const EMOJI_LIST = [
  // Faces & expressions
  "😀", "😃", "😄", "😁", "😆", "😅",
  "🤣", "😂", "🙂", "😉", "😊", "😇",
  "🥰", "😍", "🤩", "😘", "😗", "😚",
  "😋", "😛", "😜", "🤪", "😝", "🤑",
  "🤗", "🤭", "🤫", "🤔", "🤐", "🤨",
  "😐", "😑", "😶", "😏", "😒", "🙄",
  "😬", "🤥", "😌", "😔", "😪", "🤤",
  "😴", "😷", "🤒", "🤕", "🤢", "🤮",
  "🤧", "🥵", "🥶", "🥴", "😵", "🤯",
  "🤠", "🥳", "🥸", "😎", "🤓", "🧐",
  "😕", "😟", "🙁", "😮", "😯", "😲",
  "😳", "🥺", "😦", "😧", "😨", "😰",
  "😥", "😢", "😭", "😱", "😖", "😣",
  "😞", "😓", "😩", "😫", "🥱", "😤",
  "😡", "😠", "🤬", "😈", "👿", "💀",
  "☠️", "💩", "🤡", "👹", "👺", "👻",
  "👽", "👾", "🤖", "🫠", "🫡", "🫢",
  "🫣", "🫤", "🫥", "🫨", "🙈", "🙉",
  "🙊", "💋", "💌", "💘", "💝", "💖",
  "💗", "💓", "💞", "💕", "💟", "❣️",
  "💔", "❤️‍🔥", "❤️‍🩹", "❤️", "🧡", "💛",
  "💚", "💙", "💜", "🤎", "🖤", "🤍",
  // People & gestures
  "👋", "🤚", "🖐️", "✋", "🖖", "👌",
  "🤌", "🤏", "✌️", "🤞", "🤟", "🤘",
  "🤙", "👈", "👉", "👆", "🖕", "👇",
  "☝️", "👍", "👎", "✊", "👊", "🤛",
  "🤜", "👏", "🙌", "👐", "🤲", "🤝",
  "🙏", "✍️", "💅", "🤳", "💪", "🦾",
  "🦿", "🦵", "🦶", "👂", "🦻", "👃",
  "🧠", "🫀", "🫁", "🦷", "🦴", "👀",
  "👁️", "👅", "👄", "🫦", "👶", "🧒",
  "👦", "👧", "🧑", "👱", "👨", "🧔",
  "👩", "🧓", "👴", "👵", "🙍", "🙎",
  "🙅", "🙆", "💁", "🙋", "🧏", "🙇",
  "🤦", "🤷", "🧑‍⚕️", "🧑‍🎓", "🧑‍🏫", "🧑‍⚖️",
  "🧑‍🌾", "🧑‍🍳", "🧑‍🔧", "🧑‍🔬", "🧑‍💻", "🧑‍🎤",
  "🧑‍🎨", "🧑‍✈️", "🧑‍🚀", "🧑‍🚒", "👮", "🕵️",
  "💂", "🥷", "👷", "🤴", "👸", "👳",
  "👲", "🧕", "🤵", "👰", "🤰", "🤱",
  "👼", "🎅", "🤶", "🦸", "🦹", "🧙",
  "🧚", "🧛", "🧜", "🧝", "🧞", "🧟",
  "🧌", "💆", "💇", "🚶", "🧍", "🧎",
  "🏃", "💃", "🕺", "🕴️", "👯", "🧖",
  "🧗", "🤸", "🏌️", "🏇", "⛷️", "🏂",
  // Animals
  "🐵", "🐒", "🦍", "🦧", "🐶", "🐕",
  "🦮", "🐕‍🦺", "🐩", "🐺", "🦊", "🦝",
  "🐱", "🐈", "🐈‍⬛", "🦁", "🐯", "🐅",
  "🐆", "🐴", "🐎", "🦄", "🦓", "🦌",
  "🦬", "🐮", "🐂", "🐃", "🐄", "🐷",
  "🐖", "🐗", "🐽", "🐏", "🐑", "🐐",
  "🐪", "🐫", "🦙", "🦒", "🐘", "🦣",
  "🦏", "🦛", "🐭", "🐁", "🐀", "🐹",
  "🐰", "🐇", "🐿️", "🦫", "🦔", "🦇",
  "🐻", "🐻‍❄️", "🐨", "🐼", "🦥", "🦦",
  "🦨", "🦘", "🦡", "🐾", "🦃", "🐔",
  "🐓", "🐣", "🐤", "🐥", "🐦", "🐧",
  "🕊️", "🦅", "🦆", "🦢", "🦉", "🦤",
  "🪶", "🦩", "🦚", "🦜", "🐸", "🐊",
  "🐢", "🦎", "🐍", "🐲", "🐉", "🦕",
  "🦖", "🐳", "🐋", "🐬", "🦭", "🐟",
  "🐠", "🐡", "🦈", "🐙", "🐚", "🐌",
  "🦋", "🐛", "🐜", "🐝", "🪲", "🐞",
  "🦗", "🪳", "🕷️", "🕸️", "🦂", "🦟",
  "🪰", "🪱", "🦠", "🦑", "🦐", "🦞",
  "🦀", "🦆", "🦢", "🦩", "🦚", "🦜",
  // Nature & space
  "💐", "🌸", "💮", "🏵️", "🌹", "🥀",
  "🌺", "🌻", "🌼", "🌷", "🌱", "🪴",
  "🌲", "🌳", "🌴", "🌵", "🌾", "🌿",
  "☘️", "🍀", "🍁", "🍂", "🍃", "🎍",
  "🎋", "🍇", "🍈", "🍉", "🍊", "🍋",
  "🍌", "🍍", "🥭", "🍎", "🍏", "🍐",
  "🍑", "🍒", "🍓", "🫐", "🥝", "🍅",
  "🫒", "🥥", "🥑", "🍆", "🥔", "🥕",
  "🌽", "🌶️", "🫑", "🥒", "🥬", "🥦",
  "🧄", "🧅", "🍄", "🥜", "🫘", "🌰",
  "🌍", "🌎", "🌏", "🌐", "🗺️", "🧭",
  "🏔️", "⛰️", "🌋", "🗻", "🏕️", "🏖️",
  "🏜️", "🏝️", "🏞️", "🌅", "🌄", "🌠",
  "🎇", "🎆", "🌇", "🌆", "🏙️", "🌃",
  "🌌", "🌉", "🌁", "🌀", "🌈", "🌊",
  "⭐", "🌟", "💫", "✨", "☀️", "🌤️",
  "⛅", "🌥️", "☁️", "🌦️", "🌧️", "⛈️",
  "🌩️", "🌨️", "❄️", "☃️", "⛄", "🌬️",
  "💨", "🌪️", "🌫️", "🔥", "💥", "💢",
  "🌙", "🌛", "🌜", "🌚", "🌕", "🌖",
  "🌗", "🌘", "🌑", "🌒", "🌓", "🌔",
  "🪐", "💎", "☄️", "⚡", "💧", "🚀",
  // Food & drink
  "🍞", "🥐", "🥖", "🫓", "🥨", "🥯",
  "🥞", "🧇", "🧀", "🍖", "🍗", "🥩",
  "🥓", "🍔", "🍟", "🍕", "🌭", "🥪",
  "🌮", "🌯", "🫔", "🥙", "🧆", "🥚",
  "🍳", "🥘", "🍲", "🫕", "🥣", "🥗",
  "🍿", "🧈", "🧂", "🥫", "🍱", "🍘",
  "🍙", "🍚", "🍛", "🍜", "🍝", "🍠",
  "🍢", "🍣", "🍤", "🍥", "🥮", "🍡",
  "🥟", "🥠", "🥡", "🦀", "🦞", "🦐",
  "🦑", "🦪", "🍦", "🍧", "🍨", "🍩",
  "🍪", "🎂", "🍰", "🧁", "🥧", "🍫",
  "🍬", "🍭", "🍮", "🍯", "🍼", "🥛",
  "☕", "🫖", "🍵", "🍶", "🍾", "🍷",
  "🍸", "🍹", "🍺", "🍻", "🥂", "🥃",
  "🫗", "🥤", "🧋", "🧃", "🧉", "🧊",
  // Objects & symbols
  "⌚", "📱", "📲", "💻", "⌨️", "🖥️",
  "🖨️", "🖱️", "🖲️", "🕹️", "🗜️", "💽",
  "💾", "💿", "📀", "📼", "📷", "📸",
  "📹", "🎥", "📽️", "🎞️", "📞", "☎️",
  "📟", "📠", "📺", "📻", "🎙️", "🎚️",
  "🎛️", "🧭", "⏱️", "⏲️", "⏰", "🕰️",
  "⌛", "⏳", "📡", "🔋", "🔌", "💡",
  "🔦", "🕯️", "🪔", "🧯", "🛢️", "💸",
  "💵", "💴", "💶", "💷", "🪙", "💰",
  "💳", "💎", "⚖️", "🪜", "🧰", "🪛",
  "🔧", "🔨", "⚒️", "🛠️", "⛏️", "🪚",
  "🔩", "⚙️", "🪤", "🧱", "⛓️", "🧲",
  "🔫", "💣", "🧨", "🪓", "🔪", "🗡️",
  "⚔️", "🛡️", "🚬", "⚰️", "🪦", "⚱️",
  "🏺", "🔮", "📿", "🧿", "💈", "⚗️",
  "🔭", "🔬", "🕳️", "🩹", "🩺", "💊",
  "💉", "🩸", "🧬", "🦠", "🧫", "🧪",
  "🌡️", "🧹", "🪠", "🧺", "🧻", "🚽",
  "🚰", "🚿", "🛁", "🛀", "🧼", "🪥",
  "🪒", "🧽", "🪣", "🧴", "🛎️", "🔑",
  "🗝️", "🚪", "🪑", "🛋️", "🛏️", "🛌",
  "🧸", "🪆", "🖼️", "🪞", "🪟", "🛍️",
  "🛒", "🎁", "🎈", "🎏", "🎀", "🪄",
  "🪅", "🎊", "🎉", "🎎", "🏮", "🎐",
  "🧧", "✉️", "📩", "📨", "📧", "💌",
  "📥", "📤", "📦", "🏷️", "🪧", "📪",
  "📫", "📬", "📭", "📮", "📯", "📜",
  "📃", "📄", "📑", "🧾", "📊", "📈",
  "📉", "🗒️", "🗓️", "📆", "📅", "🗑️",
  "📇", "🗃️", "🗳️", "🗄️", "📋", "📁",
  "📂", "🗂️", "🗞️", "📰", "📓", "📔",
  "📒", "📕", "📗", "📘", "📙", "📚",
  "📖", "🔖", "🧷", "🔗", "📎", "🖇️",
  "📐", "📏", "🧮", "📌", "📍", "✂️",
  "🖊️", "🖋️", "✒️", "🖌️", "🖍️", "📝",
  "✏️", "🔍", "🔎", "🔏", "🔐", "🔒",
  "🔓", "🏆", "🥇", "🥈", "🥉", "🏅",
  "🎖️", "🏵️", "🎗️", "🎫", "🎟️", "🎪",
  // Sports & activities
  "⚽", "🏀", "🏈", "⚾", "🥎", "🎾",
  "🏐", "🏉", "🥏", "🎱", "🪀", "🏓",
  "🏸", "🏒", "🏑", "🥍", "🏏", "🪃",
  "🥅", "⛳", "🪁", "🏹", "🎣", "🤿",
  "🥊", "🥋", "🎽", "🛹", "🛼", "🛷",
  "⛸️", "🥌", "🎿", "⛷️", "🏂", "🪂",
  "🏋️", "🤼", "🤽", "🤾", "🤺", "⛹️",
  "🧘", "🏄", "🏊", "🚣", "🧗", "🚴",
  "🚵", "🎮", "🕹️", "🎲", "🎯", "🎳",
  "🎰", "🧩", "♟️", "🃏", "🀄", "🎴",
  // Music & entertainment
  "🎭", "🖼️", "🎨", "🧵", "🪡", "🧶",
  "🪢", "🎼", "🎵", "🎶", "🎹", "🥁",
  "🪘", "🎷", "🎺", "🪗", "🎸", "🪕",
  "🎻", "🪈", "🎤", "🎧", "📻", "🎬",
  "🎦", "🎞️", "📽️", "📹", "📺", "📸",
  // Vehicles & travel
  "🚗", "🚕", "🚙", "🚌", "🚎", "🏎️",
  "🚓", "🚑", "🚒", "🚐", "🛻", "🚚",
  "🚛", "🚜", "🦯", "🦽", "🦼", "🛴",
  "🚲", "🛵", "🏍️", "🛺", "🚨", "🚔",
  "🚍", "🚘", "🚖", "🚡", "🚠", "🚟",
  "🚃", "🚋", "🚞", "🚝", "🚄", "🚅",
  "🚈", "🚂", "🚆", "🚇", "🚊", "🚉",
  "✈️", "🛫", "🛬", "🛩️", "💺", "🛰️",
  "🚀", "🛸", "🚁", "🛶", "⛵", "🚤",
  "🛥️", "🛳️", "⛴️", "🚢", "⚓", "🪝",
  "⛽", "🚧", "🚦", "🚥", "🚏", "🗺️",
  "🗿", "🗽", "🗼", "🏰", "🏯", "🏟️",
  "🎡", "🎢", "🎠", "⛲", "⛱️", "🏖️",
  // Buildings & places
  "🏘️", "🏚️", "🏗️", "🏭", "🏢", "🏬",
  "🏣", "🏤", "🏥", "🏦", "🏨", "🏩",
  "🏪", "🏫", "🏛️", "💒", "🕌", "🕍",
  "🛕", "⛪", "🕋", "⛩️", "🛤️", "🛣️",
  // Flags & symbols
  "🏁", "🚩", "🎌", "🏴", "🏳️", "🏳️‍🌈",
  "🏳️‍⚧️", "🏴‍☠️", "♈", "♉", "♊", "♋",
  "♌", "♍", "♎", "♏", "♐", "♑",
  "♒", "♓", "⛎", "🔀", "🔁", "🔂",
  "▶️", "⏩", "⏭️", "⏯️", "◀️", "⏪",
  "⏮️", "🔼", "⏫", "🔽", "⏬", "⏸️",
  "⏹️", "⏺️", "⏏️", "🎦", "🔅", "🔆",
  "📶", "📳", "📴", "♀️", "♂️", "⚧️",
  "✖️", "➕", "➖", "➗", "🟰", "♾️",
  "‼️", "⁉️", "❓", "❔", "❕", "❗",
  "〰️", "💱", "💲", "⚕️", "♻️", "⚜️",
  "🔱", "📛", "🔰", "⭕", "✅", "☑️",
  "✔️", "❌", "❎", "➰", "➿", "〽️",
  "✳️", "✴️", "❇️", "©️", "®️", "™️",
  "🔴", "🟠", "🟡", "🟢", "🔵", "🟣",
  "🟤", "⚫", "⚪", "🟥", "🟧", "🟨",
  "🟩", "🟦", "🟪", "🟫", "⬛", "⬜",
  "◼️", "◻️", "◾", "◽", "▪️", "▫️",
  "🔶", "🔷", "🔸", "🔹", "🔺", "🔻",
  "💠", "🔘", "🔳", "🔲", "👁️‍🗨️", "🗨️",
  "💬", "👁️", "👑", "💍", "🎭", "🎯",
]

// Search emojis by keyword using emojilib
function searchEmojis(query: string): string[] {
  if (!query.trim()) return EMOJI_LIST
  const lowerQuery = query.toLowerCase().trim()

  return EMOJI_LIST.filter((emoji) => {
    // Check if emoji itself matches
    if (emoji.includes(lowerQuery)) return true
    // Check keywords from emojilib
    const keywords = emojilib[emoji as keyof typeof emojilib]
    if (keywords) {
      return keywords.some((keyword) => keyword.includes(lowerQuery))
    }
    return false
  })
}

interface AvatarCustomizerProps {
  currentCustomization: AvatarCustomization | null
  onSave: (customization: AvatarCustomization) => void
  onClear: () => void
  children: React.ReactNode
}

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false)

  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640)
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  return isMobile
}

function EmojiSelector({
  selectedEmoji,
  onSelectEmoji,
}: {
  selectedEmoji: string
  onSelectEmoji: (emoji: string) => void
}) {
  const [searchQuery, setSearchQuery] = React.useState("")
  const filteredEmojis = React.useMemo(
    () => searchEmojis(searchQuery),
    [searchQuery]
  )

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2">Emoji</p>
      <div className="relative mb-2">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-7 pl-7 pr-2 text-xs bg-zinc-900 border-zinc-800 focus-visible:ring-1"
        />
      </div>
      <div className="h-40 overflow-y-auto rounded-md bg-zinc-900 p-1.5">
        {filteredEmojis.length > 0 ? (
          <div className="grid grid-cols-6 gap-1">
            {filteredEmojis.map((emoji, index) => (
              <button
                key={`${emoji}-${index}`}
                type="button"
                onClick={() => onSelectEmoji(emoji)}
                className={cn(
                  "h-9 w-9 rounded flex items-center justify-center text-xl hover:bg-zinc-800 transition-colors touch-manipulation",
                  selectedEmoji === emoji && "bg-zinc-700"
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            No emojis found
          </div>
        )}
      </div>
    </div>
  )
}

function AvatarCustomizerContent({
  selectedEmoji,
  setSelectedEmoji,
  selectedGradient,
  setSelectedGradient,
  currentGradient,
  currentCustomization,
  onSave,
  onClear,
}: {
  selectedEmoji: string
  setSelectedEmoji: (emoji: string) => void
  selectedGradient: GradientId
  setSelectedGradient: (id: GradientId) => void
  currentGradient: typeof AVATAR_GRADIENTS[number]
  currentCustomization: AvatarCustomization | null
  onSave: () => void
  onClear: () => void
}) {
  return (
    <div className="space-y-3 pt-4">
      {/* Preview */}
      <div className="flex items-center justify-center">
        <div
          className="h-16 w-16 rounded-full flex items-center justify-center text-4xl"
          style={{
            background: `linear-gradient(135deg, ${currentGradient.colors[0]}, ${currentGradient.colors[1]})`,
          }}
        >
          {selectedEmoji}
        </div>
      </div>

      {/* Gradient selector */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">Background</p>
        <div className="grid grid-cols-4 gap-1.5">
          {AVATAR_GRADIENTS.map((gradient) => (
            <button
              key={gradient.id}
              type="button"
              onClick={() => setSelectedGradient(gradient.id)}
              className={cn(
                "h-8 w-full rounded-md transition-all touch-manipulation",
                selectedGradient === gradient.id && "ring-2 ring-white ring-offset-1 ring-offset-zinc-950"
              )}
              style={{
                background: `linear-gradient(135deg, ${gradient.colors[0]}, ${gradient.colors[1]})`,
              }}
              title={gradient.name}
            />
          ))}
        </div>
      </div>

      {/* Emoji selector */}
      <EmojiSelector
        selectedEmoji={selectedEmoji}
        onSelectEmoji={setSelectedEmoji}
      />

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          variant="default"
          className="flex-1 h-8"
          onClick={onSave}
        >
          Save
        </Button>
        {currentCustomization && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-muted-foreground hover:text-destructive"
            onClick={onClear}
            title="Reset to default"
          >
            <Eraser className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

export function AvatarCustomizer({
  currentCustomization,
  onSave,
  onClear,
  children,
}: AvatarCustomizerProps) {
  const [open, setOpen] = React.useState(false)
  const [selectedEmoji, setSelectedEmoji] = React.useState<string>(
    currentCustomization?.emoji || EMOJI_LIST[0]
  )
  const [selectedGradient, setSelectedGradient] = React.useState<GradientId>(
    currentCustomization?.gradientId as GradientId || AVATAR_GRADIENTS[0].id
  )
  const isMobile = useIsMobile()

  // Reset selection when opening
  React.useEffect(() => {
    if (open) {
      setSelectedEmoji(currentCustomization?.emoji || EMOJI_LIST[0])
      setSelectedGradient(currentCustomization?.gradientId as GradientId || AVATAR_GRADIENTS[0].id)
    }
  }, [open, currentCustomization])

  const handleSave = () => {
    onSave({ emoji: selectedEmoji, gradientId: selectedGradient })
    setOpen(false)
  }

  const handleClear = () => {
    onClear()
    setOpen(false)
  }

  const currentGradient = AVATAR_GRADIENTS.find((g) => g.id === selectedGradient) || AVATAR_GRADIENTS[0]

  const contentProps = {
    selectedEmoji,
    setSelectedEmoji,
    selectedGradient,
    setSelectedGradient,
    currentGradient,
    currentCustomization,
    onSave: handleSave,
    onClear: handleClear,
  }

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen} repositionInputs={false}>
        <DrawerTrigger asChild>{children}</DrawerTrigger>
        <DrawerContent
          className="bg-zinc-950 border-zinc-800 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-h-[80dvh] overflow-y-auto"
          data-avatar-customizer
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <AvatarCustomizerContent {...contentProps} />
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="w-72 p-3 bg-zinc-950 border-zinc-800 z-[100]"
        align="center"
        side="bottom"
        sideOffset={8}
        collisionPadding={16}
        data-avatar-customizer
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <AvatarCustomizerContent {...contentProps} />
      </PopoverContent>
    </Popover>
  )
}
