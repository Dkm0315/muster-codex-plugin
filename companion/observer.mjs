export function createTaskObserver() {
  const sessions = new Map();
  return function observeTask(threadId, changed, activity) {
    let session=sessions.get(threadId);
    if(!session){
      session={files:new Map(changed.map(item=>[item.path,item.signature])),latestObservedPath:null,knownActivity:new Set(activity.map(item=>item.id)),visibleActivity:new Map()};
      sessions.set(threadId,session);
      return session;
    }
    const newChanges=changed.filter(item=>session.files.get(item.path)!==item.signature);
    session.files=new Map(changed.map(item=>[item.path,item.signature]));
    if(newChanges.length)session.latestObservedPath=newChanges[0].path;
    for(const item of activity){
      if(!session.knownActivity.has(item.id))session.visibleActivity.set(item.id,item);
      else if(session.visibleActivity.has(item.id))session.visibleActivity.set(item.id,item);
      session.knownActivity.add(item.id);
    }
    return session;
  };
}
