import { Injectable, Component, Input, EventEmitter } from '@angular/core';
import { TreeNode } from './tree-node.model';
import { TreeOptions } from './tree-options.model';
import { ITreeModel } from '../defs/api';
import { TREE_EVENTS } from '../constants/events';

import { deprecated } from './deprecated';

import * as _ from 'lodash';

@Injectable()
export class TreeModel implements ITreeModel {
  roots: TreeNode[];
  options: TreeOptions = new TreeOptions();
  nodes: any[];
  expandedNodeIds: { [id:string]: boolean } = {};
  expandedNodes: TreeNode[];
  activeNodeIds: { [id:string]: boolean } = {};
  activeNodes: TreeNode[];
  _focusedNode: TreeNode = null;
  focusedNodeId: string = null;
  static focusedTree = null;
  private events: any;
  virtualRoot: TreeNode;
  firstUpdate = true;

  eventNames = Object.keys(TREE_EVENTS);

  setData({ nodes, options = null, events = null }) {
    if (options) {
      this.options = new TreeOptions(options);
    }
    if (events) {
      this.events = events;
    }
    if (nodes) {
      this.nodes = nodes;
    }

    this.update();
  }

  update() {
    // Rebuild tree:
    let treeNodeConfig = { virtual: true };
    treeNodeConfig[this.options.childrenField] = this.nodes;

    this.virtualRoot = this.getTreeNode(treeNodeConfig, null);

    this.roots = this.virtualRoot.children;

    this._initTreeNodeContentComponent();
    this._initLoadingComponent();

    // Fire event:
    this.fireEvent({ eventName: TREE_EVENTS.onUpdateData });
    if (this.firstUpdate) {
      this.fireEvent({ eventName: TREE_EVENTS.onInitialized });
      this.firstUpdate = false;
      this._calculateExpandedNodes();
    }

    this._loadState();
  }

  _calculateExpandedNodes(startNode = null) {
    startNode = startNode || this.virtualRoot;
    
    if (startNode.data[this.options.isExpandedField]) {
      this.expandedNodeIds[startNode.id] = true;
    }
    if (startNode.children) {
      startNode.children.forEach((child) => this._calculateExpandedNodes(child));
    }
  }

  fireEvent(event) {
    this.events[event.eventName].next(event);
  }

  get focusedNode() { deprecated('focusedNode attribute', 'getFocusedNode'); return this.getFocusedNode(); }
  set focusedNode(value) { deprecated('focusedNode = ', 'setFocusedNode'); this.setFocusedNode(value) };

  getFocusedNode():TreeNode {
    return this._focusedNode;
  }

  setFocusedNode(node) {
    this._focusedNode = node;
    this.focusedNodeId = node ? node.id : null;
  }

  getActiveNode():TreeNode {
    return this.activeNodes[0];
  }

  getActiveNodes():TreeNode[] {
    return this.activeNodes;
  }

  getTreeNode(node:any, parent:TreeNode):TreeNode {
    return new TreeNode(node, parent, this);
  }

  getFirstRoot() {
    return _.first(this.roots);
  }

  getLastRoot() {
    return _.last(this.roots);
  }

  get isFocused() {
    return TreeModel.focusedTree === this;
  }

  isNodeFocused(node) {
    return this._focusedNode === node;
  }

  setFocus(value) {
    TreeModel.focusedTree = value ? this : null;
  }


  private _treeNodeContentComponent:any;
  get treeNodeContentComponent() { return this._treeNodeContentComponent };

  private _loadingComponent:any;
  get loadingComponent() { return this._loadingComponent };

  // if treeNodeTemplate is a component - use it,
  // otherwise - it's a template, so wrap it with an AdHoc component
  _initTreeNodeContentComponent() {
    this._treeNodeContentComponent = this.options.treeNodeTemplate;
    if (typeof this._treeNodeContentComponent === 'string') {
      this._treeNodeContentComponent = this._createAdHocComponent(this._treeNodeContentComponent);
    }
  }

  // same for loading component
  _initLoadingComponent() {
    this._loadingComponent = this.options.loadingComponent;
    if (typeof this._loadingComponent === 'string') {
      this._loadingComponent = this._createAdHocComponent(this._loadingComponent);
    }
  }

  _loadState() {
    if (this.focusedNodeId) {
      this._focusedNode = this.getNodeById(this.focusedNodeId);
    }

    this.expandedNodes = Object.keys(this.expandedNodeIds)
      .filter((id) => this.expandedNodeIds[id])
      .map((id) => this.getNodeById(id))

    this.activeNodes = Object.keys(this.activeNodeIds)
      .filter((id) => this.expandedNodeIds[id])
      .map((id) => this.getNodeById(id))
  }

  getNodeByPath(path, startNode=null):TreeNode {
    if (!path) return null;

    startNode = startNode || this.virtualRoot;
    if (path.length === 0) return startNode;

    if (!startNode.children) return null;

    const childId = path.shift();
    const childNode = _.find(startNode.children, { [this.options.idField]: childId });

    if (!childNode) return null;

    return this.getNodeByPath(path, childNode)
  }

  getNodeById(id) {
    return this.getNodeBy({ id });
  }

  getNodeBy(predicate, startNode = null) {
    startNode = startNode || this.virtualRoot;

    if (!startNode.children) return null;

    const found = _.find(startNode.children, predicate);

    if (found) { // found in children
      return found;
    } else { // look in children's children
      for (let child of startNode.children) {
        const found = this.getNodeBy(predicate, child);
        if (found) return found;
      }
    }
  }

  _createAdHocComponent(templateStr): any {
    @Component({
        selector: 'TreeNodeTemplate',
        template: templateStr
    })
    class AdHocTreeNodeTemplateComponent {
        @Input() node: TreeNode;
    }
    return AdHocTreeNodeTemplateComponent;
  }

  focusNextNode() {
    let previousNode = this.getFocusedNode();
    let nextNode = previousNode ? previousNode.findNextNode() : this.getFirstRoot();
    nextNode && nextNode.focus();
  }

  focusPreviousNode() {
    let previousNode = this.getFocusedNode();
    let nextNode = previousNode ? previousNode.findPreviousNode() : this.getLastRoot();
    nextNode && nextNode.focus();
  }

  focusDrillDown() {
    let previousNode = this.getFocusedNode();
    if (previousNode && previousNode.isCollapsed && previousNode.hasChildren) {
      previousNode.toggleExpanded();
    }
    else {
      let nextNode = previousNode ? previousNode.getFirstChild() : this.getFirstRoot();
      nextNode && nextNode.focus();
    }
  }

  focusDrillUp() {
    let previousNode = this.getFocusedNode();
    if (!previousNode) return;
    if (previousNode.isExpanded) {
      previousNode.toggleExpanded();
    }
    else {
      let nextNode = previousNode.realParent;
      nextNode && nextNode.focus();
    }
  }

  isActive(node) {
    return this.activeNodeIds[node.id];
  }

  setActiveNode(node, value, multi = false) {
    if (multi) {
      this._setActiveNodeMulti(node, value);
    }
    else {
      this._setActiveNodeSingle(node, value); 
    }
  }

  _setActiveNodeSingle(node, value) {
    this.activeNodeIds = {};
    this.activeNodes = [];
    if (value) {
      this.activeNodes.push(node);
      this.activeNodeIds[node.id] = true;
    }
  }

  _setActiveNodeMulti(node, value) {
    this.activeNodeIds[node.id] = value;
    if (value) {
      if (!_.includes(this.activeNodes, node)) {
        this.activeNodes.push(node);
      }
    } else {
      if (_.includes(this.activeNodes, node)) {
        _.remove(this.activeNodes, node);
      }
    }
  }

  isExpanded(node) {
    return this.expandedNodeIds[node.id];
  }

  setExpandedNode(node, value) {
    const index = _.indexOf(this.expandedNodes, node);

    if (value && !index) this.expandedNodes.push(node);
    else if (index) _.pullAt(this.expandedNodes, index);

    this.expandedNodeIds[node.id] = value;
  }

  performKeyAction(node, $event) {
    const action = this.options.actionMapping.keys[$event.keyCode]
    if (action) {
      action(this, node, $event);
      return true;
    } else {
      return false;
    }
  }
}
