Component({
  options: {
    styleIsolation: 'apply-shared',
  },
  data: {
    /* 6 步：与 t-steps 一致；第 1、3 步内容较高（日期/头像区） */
    steps: [
      { tall: true },
      { tall: false },
      { tall: true },
      { tall: false },
      { tall: false },
      { tall: false },
    ],
  },
})
