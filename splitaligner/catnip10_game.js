(function(){
  "use strict";

  const DATA=window.CATNIP10_GAME_DATA;
  if(!DATA)return;

  const COPY={
    en:{
      branch:"Branch",state:"State",deleteTaxon:"Delete taxon",deleteTip:t=>`Delete ${t}`,
      selectTip:"Select a tip branch",alreadyDeleted:"Taxon already deleted",minThree:"Keep at least 3 taxa",
      undo:"Undo",reset:"Reset",retained:n=>`${n} taxa retained`,
      counts:(o,f,s)=>`${o} observed · ${f} NA_fuse · ${s} NA_struct`,
      selectBranch:"Select a branch in the tree or ledger to inspect its current identity.",
      observed:"remains independently observable on the retained taxon set.",
      fused:g=>`is not independently observable; one reduced edge absorbs the fusion group ${g}.`,
      structural:"has no projected identity because one side is empty on the retained taxon set.",
      deleted:"Deleted",none:"none",route:"Figure S1 path",treeLabel:"Interactive Catnip10 branch-identity tree",
      legendObserved:"observed",legendFuse:"NA_fuse",legendStruct:"NA_struct"
    },
    ja:{
      branch:"枝",state:"状態",deleteTaxon:"分類群を削除",deleteTip:t=>`${t} を削除`,
      selectTip:"末端枝を選択",alreadyDeleted:"削除済み",minThree:"3分類群以上を保持",
      undo:"元に戻す",reset:"リセット",retained:n=>`${n}分類群を保持`,
      counts:(o,f,s)=>`${o} observed · ${f} NA_fuse · ${s} NA_struct`,
      selectBranch:"樹または台帳の枝を選択すると、現在の同一性を確認できます。",
      observed:"保持された分類群集合上で、独立した原始枝として観測できます。",
      fused:g=>`独立には観測できず、一つの縮約枝が融合群 ${g} を吸収しています。`,
      structural:"保持された分類群集合上で片側が空になり、射影された同一性がありません。",
      deleted:"削除済み",none:"なし",route:"Figure S1 の経路",treeLabel:"Catnip10 枝同一性インタラクティブ樹",
      legendObserved:"observed",legendFuse:"NA_fuse",legendStruct:"NA_struct"
    },
    zh:{
      branch:"枝",state:"状态",deleteTaxon:"删除类群",deleteTip:t=>`删除 ${t}`,
      selectTip:"请选择末端枝",alreadyDeleted:"该类群已删除",minThree:"至少保留 3 个类群",
      undo:"撤销",reset:"重置",retained:n=>`保留 ${n} 个类群`,
      counts:(o,f,s)=>`${o} observed · ${f} NA_fuse · ${s} NA_struct`,
      selectBranch:"点击树枝或台账中的枝，查看它现在的身份。",
      observed:"在当前保留的类群集合上，仍可作为独立原始枝观测。",
      fused:g=>`不再能独立观测；同一条约化枝吸收了融合组 ${g}。`,
      structural:"在当前保留的类群集合上有一侧为空，因此没有投影身份。",
      deleted:"已删除",none:"无",route:"Figure S1 路径",treeLabel:"Catnip10 枝身份互动树",
      legendObserved:"observed",legendFuse:"NA_fuse",legendStruct:"NA_struct"
    }
  };

  const SVGNS="http://www.w3.org/2000/svg";
  const STATUS={O:"observed",F:"fuse",S:"struct"};
  const TIP_BITS=new Map(DATA.tips.map((tip,index)=>[tip,1<<index]));
  const AXIS_BY_ID=new Map(DATA.axis.map(branch=>[branch.id,branch]));
  const AXIS_BY_ORACLE=new Map(DATA.axis.map(branch=>[branch.oracle,branch]));

  function svgEl(name,attrs={}){
    const node=document.createElementNS(SVGNS,name);
    Object.entries(attrs).forEach(([key,value])=>node.setAttribute(key,value));
    return node;
  }

  function toyTree(){
    return {id:"N_11",children:[
      {id:"N_16",children:[
        {id:"N_18",children:[{name:"t6"},{name:"t3"}]},
        {id:"N_17",children:[{name:"t2"},{name:"t5"}]}
      ]},
      {id:"N_12",children:[
        {id:"N_13",children:[
          {id:"N_14",children:[
            {name:"t9"},
            {id:"N_15",children:[{name:"t4"},{name:"t7"}]}
          ]},
          {name:"t8"}
        ]},
        {name:"t1"}
      ]},
      {name:"t10"}
    ]};
  }

  function layoutTree(node,depth,context){
    node.depth=depth;
    if(node.children){
      node.children.forEach(child=>{
        child.parent=node;
        layoutTree(child,depth+1,context);
      });
      node.y=(node.children[0].y+node.children[node.children.length-1].y)/2;
    }else{
      node.y=context.leaf++;
      context.maxDepth=Math.max(context.maxDepth,depth);
    }
  }

  function flattenTree(node,out=[]){
    out.push(node);
    if(node.children)node.children.forEach(child=>flattenTree(child,out));
    return out;
  }

  function initGame(root){
    const lang=COPY[root.dataset.lang] ? root.dataset.lang : "en";
    const text=COPY[lang];
    root.innerHTML=`
      <div class="catnip-toolbar">
        <div class="catnip-status" data-role="status" aria-live="polite"></div>
        <div class="catnip-actions">
          <button type="button" class="catnip-action primary" data-action="delete" disabled>${text.deleteTaxon}</button>
          <button type="button" class="catnip-action" data-action="undo" disabled>${text.undo}</button>
          <button type="button" class="catnip-action" data-action="reset" disabled>${text.reset}</button>
        </div>
      </div>
      <div class="catnip-grid">
        <div class="catnip-tree-pane">
          <svg class="catnip-tree" data-role="tree" viewBox="0 0 600 440" role="img" aria-label="${text.treeLabel}"></svg>
          <div class="catnip-legend" aria-label="State legend">
            <span><i class="catnip-key"></i>${text.legendObserved}</span>
            <span><i class="catnip-key fuse"></i>${text.legendFuse}</span>
            <span><i class="catnip-key struct"></i>${text.legendStruct}</span>
          </div>
        </div>
        <div class="catnip-ledger-pane">
          <div class="catnip-cellhead">${text.branch}</div>
          <div class="catnip-cellgrid" data-role="ledger" role="list" aria-label="${text.branch}"></div>
          <div class="catnip-summary" data-role="summary"></div>
        </div>
      </div>
      <div class="catnip-detail" data-role="detail" aria-live="polite"></div>
      <div class="catnip-history">
        <span data-role="history"></span>
        <span class="catnip-route">${text.route}: ${DATA.canonicalOrder.join(" → ")}</span>
      </div>`;

    const tree=root.querySelector('[data-role="tree"]');
    const ledger=root.querySelector('[data-role="ledger"]');
    const summary=root.querySelector('[data-role="summary"]');
    const status=root.querySelector('[data-role="status"]');
    const detail=root.querySelector('[data-role="detail"]');
    const historyLabel=root.querySelector('[data-role="history"]');
    const deleteButton=root.querySelector('[data-action="delete"]');
    const undoButton=root.querySelector('[data-action="undo"]');
    const resetButton=root.querySelector('[data-action="reset"]');

    let mask=0;
    let selectedId="B1";
    let actions=[];
    const branchElements=new Map();
    const tipElements=new Map();
    const rows=new Map();

    function selectBranch(branchId){
      selectedId=branchId;
      render();
    }

    function drawTree(){
      const spec=toyTree();
      const context={leaf:0,maxDepth:0};
      layoutTree(spec,0,context);
      const nodes=flattenTree(spec);
      const pad={left:28,right:78,top:22,bottom:22};
      const width=600,height=440;
      const dx=(width-pad.left-pad.right)/Math.max(1,context.maxDepth);
      const dy=(height-pad.top-pad.bottom)/Math.max(1,context.leaf-1);
      const x=node=>pad.left+(node.children?node.depth:context.maxDepth)*dx;
      const y=node=>pad.top+node.y*dy;

      const connectors=svgEl("g");
      const highlights=svgEl("g");
      const edges=svgEl("g");
      const labels=svgEl("g");

      nodes.filter(node=>node.children).forEach(node=>{
        const childYs=node.children.map(y);
        connectors.appendChild(svgEl("path",{
          d:`M${x(node)} ${Math.min(...childYs)} L${x(node)} ${Math.max(...childYs)}`,
          class:"catnip-connector"
        }));
      });

      nodes.forEach(node=>{
        if(!node.parent)return;
        const oracleId=node.id||node.name;
        const axis=AXIS_BY_ORACLE.get(oracleId);
        if(!axis)return;
        const pathData=`M${x(node.parent)} ${y(node)} L${x(node)} ${y(node)}`;
        const hit=svgEl("path",{d:pathData,class:"catnip-edge-hit","data-branch":axis.id});
        const edge=svgEl("path",{d:pathData,class:"catnip-edge state-observed","data-branch":axis.id});
        hit.addEventListener("click",()=>selectBranch(axis.id));
        highlights.appendChild(hit);
        edges.appendChild(edge);

        const branchLabel=svgEl("text",{
          x:(x(node.parent)+x(node))/2,
          y:y(node)-8,
          class:"catnip-branch-label",
          "text-anchor":"middle",
          "data-branch":axis.id
        });
        branchLabel.textContent=axis.id;
        branchLabel.addEventListener("click",()=>selectBranch(axis.id));
        labels.appendChild(branchLabel);
        branchElements.set(axis.id,{hit,edge,label:branchLabel});
      });

      nodes.filter(node=>!node.children).forEach(node=>{
        const axis=AXIS_BY_ORACLE.get(node.name);
        const dot=svgEl("circle",{cx:x(node),cy:y(node),r:3.2,class:"catnip-tip-dot"});
        const tipLabel=svgEl("text",{
          x:x(node)+10,
          y:y(node),
          class:"catnip-tip-label",
          "data-tip":node.name
        });
        tipLabel.textContent=node.name;
        if(axis){
          dot.addEventListener("click",()=>selectBranch(axis.id));
          tipLabel.addEventListener("click",()=>selectBranch(axis.id));
        }
        labels.appendChild(dot);
        labels.appendChild(tipLabel);
        tipElements.set(node.name,{dot,label:tipLabel});
      });

      tree.appendChild(connectors);
      tree.appendChild(highlights);
      tree.appendChild(edges);
      tree.appendChild(labels);
    }

    function buildLedger(){
      DATA.axis.forEach(axis=>{
        const cell=document.createElement("button");
        cell.type="button";
        cell.className="catnip-cell state-observed";
        cell.dataset.branch=axis.id;
        cell.setAttribute("role","listitem");
        cell.setAttribute("aria-label",`${axis.id}, ${axis.oracle}, observed`);
        cell.title=`${axis.id} · ${axis.oracle}`;
        cell.innerHTML=`<span class="cell-id">${axis.id}</span><span class="cell-alias">${axis.oracle}</span>`;
        cell.addEventListener("click",()=>selectBranch(axis.id));
        ledger.appendChild(cell);
        rows.set(axis.id,{cell});
      });
    }

    function isTipDeleted(tip){
      return (mask & TIP_BITS.get(tip)) !== 0;
    }

    function retainedCount(){
      let deleted=0;
      DATA.tips.forEach(tip=>{if(isTipDeleted(tip))deleted+=1;});
      return DATA.tips.length-deleted;
    }

    function currentState(){
      const encoded=DATA.states[String(mask)];
      if(!encoded)throw new Error(`Missing Catnip10 oracle state for mask ${mask}`);
      return {statuses:encoded[0],groups:encoded[1].map(group=>group.split("|"))};
    }

    function render(){
      const current=currentState();
      const selectedIndex=DATA.axis.findIndex(branch=>branch.id===selectedId);
      const selectedStatus=selectedIndex>=0 ? STATUS[current.statuses[selectedIndex]] : null;
      const selectedGroup=selectedStatus==="fuse"
        ? current.groups.find(group=>group.includes(selectedId))||[]
        : [];
      const related=new Set(selectedGroup);
      let observed=0,fuse=0,structural=0;

      DATA.axis.forEach((axis,index)=>{
        const state=STATUS[current.statuses[index]];
        if(state==="observed")observed+=1;
        if(state==="fuse")fuse+=1;
        if(state==="struct")structural+=1;

        const branch=branchElements.get(axis.id);
        branch.edge.className.baseVal=`catnip-edge state-${state}`;
        branch.hit.className.baseVal="catnip-edge-hit";
        if(related.has(axis.id))branch.hit.classList.add("is-related");
        if(axis.id===selectedId)branch.hit.classList.add("is-selected");
        branch.label.classList.toggle("is-selected",axis.id===selectedId);

        const label=state==="observed" ? "observed" : state==="fuse" ? "NA_fuse" : "NA_struct";
        const rowData=rows.get(axis.id);
        rowData.cell.className=`catnip-cell state-${state}`;
        rowData.cell.classList.toggle("is-selected",axis.id===selectedId);
        rowData.cell.classList.toggle("is-related",related.has(axis.id)&&axis.id!==selectedId);
        rowData.cell.setAttribute("aria-label",`${axis.id}, ${axis.oracle}, ${label}`);
      });

      summary.innerHTML=
        `<span class="catnip-sum observed"><i></i>observed <b>${observed}</b></span>`+
        `<span class="catnip-sum fuse"><i></i>NA_fuse <b>${fuse}</b></span>`+
        `<span class="catnip-sum struct"><i></i>NA_struct <b>${structural}</b></span>`;

      DATA.tips.forEach(tip=>{
        const deleted=isTipDeleted(tip);
        const elements=tipElements.get(tip);
        elements.label.classList.toggle("is-deleted",deleted);
        elements.dot.classList.toggle("is-deleted",deleted);
      });

      const retained=retainedCount();
      status.textContent=`${text.retained(retained)} · ${text.counts(observed,fuse,structural)}`;
      undoButton.disabled=actions.length===0;
      resetButton.disabled=mask===0;

      const selected=AXIS_BY_ID.get(selectedId);
      const selectedDeleted=selected&&selected.kind==="terminal"&&isTipDeleted(selected.oracle);
      const canDelete=selected&&selected.kind==="terminal"&&!selectedDeleted&&retained>3;
      deleteButton.disabled=!canDelete;
      deleteButton.textContent=!selected||selected.kind!=="terminal"
        ? text.selectTip
        : selectedDeleted
          ? text.alreadyDeleted
          : retained<=3
            ? text.minThree
            : text.deleteTip(selected.oracle);

      if(!selected){
        detail.textContent=text.selectBranch;
      }else{
        const stateLabel=selectedStatus==="observed" ? "observed" : selectedStatus==="fuse" ? "NA_fuse" : "NA_struct";
        const explanation=selectedStatus==="observed"
          ? text.observed
          : selectedStatus==="fuse"
            ? text.fused(selectedGroup.join(" | "))
            : text.structural;
        detail.innerHTML=`<strong>${selected.id} (${selected.oracle}) · ${stateLabel}</strong> — ${explanation}`;
      }

      const deletedOrder=actions.map(action=>action.tip);
      historyLabel.textContent=`${text.deleted}: ${deletedOrder.length ? deletedOrder.join(" → ") : text.none}`;
    }

    deleteButton.addEventListener("click",()=>{
      const selected=AXIS_BY_ID.get(selectedId);
      if(!selected||selected.kind!=="terminal"||isTipDeleted(selected.oracle)||retainedCount()<=3)return;
      actions.push({mask,tip:selected.oracle});
      mask|=TIP_BITS.get(selected.oracle);
      render();
    });
    undoButton.addEventListener("click",()=>{
      const previous=actions.pop();
      if(!previous)return;
      mask=previous.mask;
      render();
    });
    resetButton.addEventListener("click",()=>{
      mask=0;
      actions=[];
      selectedId="B1";
      render();
    });

    drawTree();
    buildLedger();
    render();
  }

  document.querySelectorAll(".catnip-game").forEach(initGame);
})();
