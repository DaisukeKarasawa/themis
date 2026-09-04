
export const SOP_ASSETS = [
  {
    id: "desk_task",
    label: "デスク作業チェック",
    description: "デスク上の一連の作業が、想定した順番で行われているかを確認します。",
    sop: { id: "desk_task", name: "デスク作業チェック" },
    domain_hint:
      "これはデスク上の作業を上から撮った動画の1フレームです。デスク上にはペットボトル、紙コップ、ティッシュ、Magic Trackpad（トラックパッド）が見える",
    questions: [
      { id: "1", ask: "作業者の手がデスク上のペットボトルから離れているか", values: ["yes", "no"] },
      { id: "2", ask: "作業者の手が握り拳（グー）の形をしているか", values: ["yes", "no"] },
      { id: "3", ask: "作業者がデスク上のティッシュを紙コップの中に入れているか", values: ["yes", "no"] },
      { id: "4", ask: "作業者がMagic Trackpad（トラックパッド）をティッシュで拭いているか", values: ["yes", "no"] },
      { id: "5", ask: "作業者がMagic Trackpadを拭うのに使ったティッシュを、紙コップの中に入れているか", values: ["yes", "no"] }
    ],
    relations: [],
    eventDefs: [
      { name: "step_1", evidence: "1==yes", occurrence: 1 },
      { name: "step_2", evidence: "2==yes", occurrence: 1 },
      { name: "step_3", evidence: "3==yes", occurrence: 1 },
      { name: "step_4", evidence: "4==yes", occurrence: 1 },
      { name: "step_5", evidence: "5==yes", occurrence: 1 }
    ]
  },
  {
    id: "desk_cleanup_check",
    label: "デスク片付けチェック",
    description: "デスク上のゴミや持ち物が、指定された場所に片付けられているかを確認します。",
    sop: { id: "desk_cleanup_check", name: "デスク片付けチェック" },
    domain_hint:
      "これはデスク上の片付け作業を上から撮った動画の1フレームです。デスク上には飲み物が残っているペットボトル、空に見えるペットボトル、紙コップ、2つのティッシュ、ガムの包み紙の銀紙、ハンカチが見える可能性があります。左右は画像を見る人から見た左右で判断します。",
    questions: [
      { id: "cleanup_trash_action", ask: "作業者の手が、ティッシュまたはガムの包み紙の銀紙を紙コップの中へ入れている最中か", values: ["yes", "no"] },
      { id: "fold_handkerchief_action", ask: "作業者の手が、ハンカチを四角く折り畳んでいる最中か", values: ["yes", "no"] },
      { id: "move_empty_bottle_right_action", ask: "作業者の手が、空に見えるペットボトルをデスクの右側へ移動している最中か", values: ["yes", "no"] },
      { id: "move_filled_bottle_left_action", ask: "作業者の手が、飲み物が残っているペットボトルをデスクの左側へ移動している最中か", values: ["yes", "no"] },
      { id: "tissues_in_cup", ask: "デスク上にある2つのティッシュが、どちらも紙コップの中に入っているか", values: ["yes", "no"] },
      { id: "filled_bottle_left", ask: "飲み物が残っているペットボトルが、デスクの左側に置かれているか", values: ["yes", "no"] },
      { id: "empty_bottle_right", ask: "飲み物が残っていない、または空に見えるペットボトルが、デスクの右側に置かれているか", values: ["yes", "no"] },
      { id: "handkerchief_folded", ask: "ハンカチが四角く折り畳まれているか", values: ["yes", "no"] },
      { id: "handkerchief_right", ask: "折り畳まれたハンカチが、デスクの右側に置かれているか", values: ["yes", "no"] },
      { id: "trash_in_cup", ask: "ガムの包み紙の銀紙や使用済みティッシュなどのゴミが、すべて紙コップの中に入っているか", values: ["yes", "no"] },
      { id: "cleared_items_right", ask: "飲み物が残っているペットボトル以外の対象物（空に見えるペットボトル、ハンカチ、紙コップ）が、いずれもデスクの右側に置かれているか", values: ["yes", "no"] }
    ],
    relations: [
      "fold_handkerchief_action before handkerchief_folded",
      "fold_handkerchief_action before handkerchief_right",
      "handkerchief_folded before handkerchief_right"
    ],
    eventDefs: [
      { name: "cleanup_trash_action", evidence: "cleanup_trash_action==yes", occurrence: 1 },
      { name: "fold_handkerchief_action", evidence: "fold_handkerchief_action==yes", occurrence: 1 },
      { name: "move_empty_bottle_right_action", evidence: "move_empty_bottle_right_action==yes", occurrence: 1 },
      { name: "move_filled_bottle_left_action", evidence: "move_filled_bottle_left_action==yes", occurrence: 1 },
      { name: "tissues_in_cup", evidence: "tissues_in_cup==yes", occurrence: 1 },
      { name: "filled_bottle_left", evidence: "filled_bottle_left==yes", occurrence: 1 },
      { name: "empty_bottle_right", evidence: "empty_bottle_right==yes", occurrence: 1 },
      { name: "handkerchief_folded", evidence: "handkerchief_folded==yes", occurrence: 1 },
      { name: "handkerchief_right", evidence: "handkerchief_right==yes", occurrence: 1 },
      { name: "trash_in_cup", evidence: "trash_in_cup==yes", occurrence: 1 },
      { name: "cleared_items_right", evidence: "cleared_items_right==yes", occurrence: 1 }
    ]
  }
];

